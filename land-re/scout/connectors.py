"""Provider calls require credentials, explicit per-run approval and conservative cost reservations."""
import os,json,hashlib,datetime as dt,threading,httpx
from analysis import ACRE_SQFT
CALL_LOCK=threading.RLock()
class Provider:
 def __init__(self,name,store,client=None):self.name=name;self.store=store;self.client=client or httpx.Client(timeout=40);self.lock=CALL_LOCK
 def settings(self):
  prefix=self.name.upper();return dict(key=os.getenv(prefix+'_API_KEY',''),enabled=os.getenv(prefix+'_ENABLED','false').lower()=='true',budget=float(os.getenv(prefix+'_MONTHLY_BUDGET','0')),cost=float(os.getenv(prefix+'_COST_RESERVATION','0')))
 def plan(self,queries,max_requests):
  cfg=self.settings();uncached=[]
  for q in queries:
   key=self.cache_key(q)
   if self.store.cached(key)is None and key not in [self.cache_key(x)for x in uncached]:uncached.append(q)
  n=len(uncached);return dict(provider=self.name,requests=n,cached_or_duplicate=len(queries)-n,estimated_reserved_cost=n*cfg['cost'],monthly_budget=cfg['budget'],configured=bool(cfg['key'])and cfg['enabled']and cfg['budget']>0 and cfg['cost']>0,within_search_limit=n<=max_requests,queries=uncached,warning='Reservations are configured planning caps, not a provider billing guarantee; include all metered request/record/token costs.')
 def cache_key(self,q):return hashlib.sha256((self.name+json.dumps(q,sort_keys=True)).encode()).hexdigest()
 def call(self,q,approved=False):
  key=self.cache_key(q)
  with self.lock:
   cached=self.store.cached(key)
   if cached is not None:return cached
   cfg=self.settings()
   if not approved:raise PermissionError('Explicit approval is required before a paid call')
   if not cfg['enabled']or not cfg['key']or cfg['budget']<=0 or cfg['cost']<=0:raise PermissionError('Provider disabled: configure credentials, budget and per-call cost reservation')
   id=self.store.reserve(self.name,cfg['cost'],cfg['budget'])
   try:
    payload=self.request(q,cfg['key']);self.store.cache(key,self.name,payload);self.store.finish(id,'success');return payload
   except Exception:
    self.store.finish(id,'failed_reserved');raise RuntimeError(self.name+' API failed; reservation retained because failed requests may be billable. Inspect provider availability and query; no automatic retry.')from None
 def run(self,queries,max_requests,approved=False):
  plan=self.plan(queries,max_requests)
  if not plan['within_search_limit']:raise PermissionError('Maximum requests per search exceeded; narrow the shortlist')
  results=[]
  for q in queries:
   try:results.append(dict(query=q,status='ok',data=self.call(q,approved)))
   except Exception as e:results.append(dict(query=q,status='error',error=str(e)))
  return results
class RentCast(Provider):
 def __init__(self,store,client=None,geographies=None):
  super().__init__('rentcast',store,client);self.geographies=geographies or []
 def request(self,q,key):
  mode=q.get('mode');params={k:v for k,v in q.items()if k not in ['mode','geoid']};endpoint='https://api.rentcast.io/v1/properties'if mode in ['homes','lots']else 'https://api.rentcast.io/v1/listings/sale'
  r=self.client.get(endpoint,params=params,headers={'X-Api-Key':key});r.raise_for_status();data=r.json()
  if not isinstance(data,list):raise ValueError('Unexpected RentCast schema')
  return data
 def queries(self,markets,p,mode):
  out=[]
  for m in markets:
   q=dict(mode=mode,geoid=m['geoid'],latitude=m['lat'],longitude=m['lon'],radius=min(100,p.town_miles),limit=100,offset=0,propertyType='Single Family'if mode=='homes'else 'Land')
   lo,hi=(p.lot_target-p.lot_tolerance,p.lot_target+p.lot_tolerance)if mode in ['homes','lots']else(p.min_acres,p.max_acres);q['lotSize']=f'{lo*ACRE_SQFT:.0f}:{hi*ACRE_SQFT:.0f}'
   if mode in ['homes','lots']:q['saleDateRange']=f'1:{p.lookback_months*31}'
   else:q.update(status='Active',price=f'0:{p.max_acres*p.max_price_acre:.0f}')
   out.append(q)
  return out
 def normalize(self,row,mode,geoid):
  # Inactive listings are never mapped into closed comps. Last sale must include a dated price.
  observed=dt.date.today().isoformat();actual_geo=row.get('countyFips')or row.get('countyFIPS')
  if not actual_geo:
   county=str(row.get('county')or row.get('countyName')or'').strip().lower();state=row.get('state')
   actual_geo=next((m['geoid']for m in self.geographies if m['state']==state and m['name'].split(',')[0].strip().lower()==county),None)
  base=dict(property_id=row.get('id')or row.get('formattedAddress'),geoid=actual_geo,address=row.get('formattedAddress',''),latitude=row.get('latitude'),longitude=row.get('longitude'),lot_acres=(row.get('lotSize')or 0)/ACRE_SQFT,sqft=row.get('squareFootage'),bedrooms=row.get('bedrooms'),bathrooms=row.get('bathrooms'),year_built=row.get('yearBuilt'),source_url='https://developers.rentcast.io/reference/property-records',observed_at=observed,verification_status='provider_reported',confidence=.7,days_on_market=row.get('daysOnMarket'))
  if mode=='tracts':base.update(status='active'if row.get('status')=='Active'else'inactive',property_type='raw_land',asking_price=row.get('price'),source_url=row.get('url')or'https://developers.rentcast.io/reference/sale-listings')
  else:base.update(status='closed'if row.get('lastSaleDate')and row.get('lastSalePrice')else'record_only',sale_price=row.get('lastSalePrice'),closed_date=str(row.get('lastSaleDate',''))[:10],property_type='single_family'if mode=='homes'else'vacant_land')
  # Land records require independent finished/residential classification before lot valuation.
  return base
class Regrid(Provider):
 def __init__(self,store,client=None):super().__init__('regrid',store,client)
 def request(self,q,key):
  r=self.client.get('https://app.regrid.com/api/v2/parcels/query',params={**q,'token':key,'return_enhanced_ownership':'false'});r.raise_for_status();data=r.json()
  if not isinstance(data.get('parcels',{}).get('features'),list):raise ValueError('Unexpected Regrid schema')
  return data
 def queries(self,markets,p):return [{'fields[geoid][eq]':m['geoid'],'fields[ll_gisacre][between]':json.dumps([p.min_acres,p.max_acres]),'limit':100}for m in markets]
 def normalize(self,feature,geoid):
  fields=feature.get('properties',{}).get('fields',feature.get('properties',{}));return dict(property_id=fields.get('ll_uuid')or fields.get('parcelnumb'),geoid=geoid,lot_acres=fields.get('ll_gisacre'),geometry=feature.get('geometry'),land_use=fields.get('lbcs_activity'),status='inventory',property_type='parcel_inventory',source_url='https://app.regrid.com',observed_at=dt.date.today().isoformat(),verification_status='provider_reported',confidence=.7)
class Perplexity(Provider):
 def __init__(self,store,client=None):super().__init__('perplexity',store,client)
 def request(self,q,key):
  text=q['question']+' Provide only cited employer, infrastructure and regulatory facts. Require publication date and URL for each finding. Separate proposals/announcements from completed projects. Do not estimate property sale prices or approved subdivision yield.'
  # Sonar's official migration docs recommend Agent API for new projects after 2026-09-27.
  legacy=os.getenv('PERPLEXITY_MODE','agent')=='sonar'
  url='https://api.perplexity.ai/v1/sonar'if legacy else'https://api.perplexity.ai/v1/agent'
  payload=dict(model='sonar',messages=[{'role':'user','content':text}],max_tokens=1200)if legacy else dict(preset='fast',input=text,max_output_tokens=1200)
  r=self.client.post(url,json=payload,headers={'Authorization':'Bearer '+key});r.raise_for_status();d=r.json();sources=d.get('search_results',[])if legacy else [r for o in d.get('output',[])if o.get('type')=='search_results'for r in o.get('results',[])]
  cited=[s for s in sources if s.get('url')and s.get('date')]
  if not cited:raise ValueError('Research response lacked dated citations')
  answer=d['choices'][0]['message']['content']if legacy else'\n'.join(c.get('text','')for o in d.get('output',[])if o.get('type')=='message'for c in o.get('content',[]))
  return dict(answer=answer,sources=cited,undated_sources=[s for s in sources if not s.get('date')],confidence='Requires source verification',observed_at=dt.date.today().isoformat())
class BEA:
 def __init__(self,client=None):self.client=client or httpx.Client(timeout=40)
 def regional(self,table='CAGDP1',line=1,years='2023,2024'):
  key=os.getenv('BEA_API_KEY','')
  if not key:raise PermissionError('Free BEA API key not configured')
  r=self.client.get('https://apps.bea.gov/api/data/',params={'UserID':key,'method':'GetData','datasetname':'Regional','TableName':table,'LineCode':line,'GeoFIPS':'COUNTY','Year':years,'ResultFormat':'JSON'});r.raise_for_status();d=r.json()['BEAAPI']['Results']
  if 'Error'in d:raise RuntimeError('BEA data request failed')
  return d['Data']
