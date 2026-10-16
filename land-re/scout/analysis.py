import datetime as dt,calendar,csv,io,hashlib,json,math,statistics
from config import SearchProfile
ACRE_SQFT=43560

def cutoff_date(asof,months):
 y,m=asof.year,asof.month-months
 while m<=0:y-=1;m+=12
 return dt.date(y,m,min(asof.day,calendar.monthrange(y,m)[1]))
def quantile(values,q):
 values=sorted(values)
 if not values:return None
 x=(len(values)-1)*q;i=math.floor(x);return values[i]+(values[min(i+1,len(values)-1)]-values[i])*(x-i)
def growth(a,b):return (a/b-1)*100 if a is not None and b is not None and b>0 else None
def haversine(a,b,c,d):
 r=3958.7613;la,lb=map(math.radians,[a,c]);delta=math.radians(c-a);lon=math.radians(d-b);return r*2*math.asin(min(1,math.sqrt(math.sin(delta/2)**2+math.cos(la)*math.cos(lb)*math.sin(lon/2)**2)))
def clean_bool(v):
 if isinstance(v,bool):return v
 if str(v).lower()in ['true','yes','1']:return True
 if str(v).lower()in ['false','no','0']:return False
 return None
NUMERIC=['lot_acres','sqft','sale_price','asking_price','year_built','bedrooms','bathrooms','days_on_market','latitude','longitude','town_miles','employment_minutes','frontage_ft','flood_fraction','slope','approved_lot_count','septic_capacity','confidence']
BOOLS=['road_access','utilities','subdivision_verified','residential_use','finished','internal_road','geometry_verified','legal_access_verified']
def normalize_records(rows,kind):
 if kind not in ['homes','lots','tracts']:raise ValueError('Unknown import kind')
 required=['property_id','geoid','lot_acres','source_url','observed_at','status']
 result=[];errors=[];seen=set()
 for i,r in enumerate(rows,2):
  try:
   if any(not r.get(k) for k in required):raise ValueError('Required: '+', '.join(required))
   r={str(k).strip():v.strip()if isinstance(v,str)else v for k,v in r.items()};r['geoid']=str(r['geoid']).zfill(5)
   if len(r['geoid'])!=5 or not r['geoid'].isdigit():raise ValueError('Five-digit county FIPS required')
   if not str(r['source_url']).startswith(('https://','http://')):raise ValueError('Valid source URL required')
   if dt.date.fromisoformat(str(r['observed_at'])[:10])>dt.date.today():raise ValueError('Observation date is in future')
   for k in NUMERIC:
    r[k]=float(r[k]) if r.get(k)not in [None,''] else None
    if r[k]is not None and not math.isfinite(r[k]):raise ValueError(k+' is not finite')
   if r['lot_acres']is None or r['lot_acres']<=0:raise ValueError('Positive lot_acres required')
   for k in ['sqft','sale_price','asking_price','bedrooms','bathrooms','days_on_market','town_miles','employment_minutes','frontage_ft','approved_lot_count','septic_capacity']:
    if r[k]is not None and r[k]<0:raise ValueError(k+' must be nonnegative')
   if r['year_built']is not None and not 1800<=r['year_built']<=dt.date.today().year:raise ValueError('Invalid / future year built')
   for k,lo,hi in [('latitude',-90,90),('longitude',-180,180),('flood_fraction',0,1),('slope',0,90)]:
    if r[k]is not None and not lo<=r[k]<=hi:raise ValueError(k+' outside valid range')
   for k in BOOLS:r[k]=clean_bool(r.get(k))
   r['status']=str(r['status']).lower();r['verification_status']=r.get('verification_status','unverified')
   if r['confidence']is None:r['confidence']=1 if r['verification_status']=='verified'else .7 if r['verification_status']=='provider_reported'else .3
   if not 0<=r['confidence']<=1:raise ValueError('confidence must be 0–1')
   if kind in ['homes','lots']:
    if r['status']!='closed':raise ValueError('Closed transactions only; listings/estimates are not comps')
    if not r.get('closed_date')or dt.date.fromisoformat(r['closed_date'])>dt.date.today():raise ValueError('Valid past closed_date required')
    if not r['sale_price']or r['sale_price']<=0:raise ValueError('Positive closed sale_price required')
    if kind=='homes'and(r.get('property_type')!='single_family' or not r['sqft']or r['sqft']<=0):raise ValueError('Single-family home with positive sqft required')
    if kind=='lots'and(r.get('property_type')!='finished_lot' or r['finished']is not True or r['residential_use']is not True):raise ValueError('Finished residential lot evidence required; raw/agricultural land is not a finished lot')
   else:
    if r.get('property_type')not in ['raw_land','parcel_inventory']:raise ValueError('Parent tract type must be raw_land or parcel_inventory')
    if r['status']=='active'and(not r['asking_price']or r['asking_price']<=0):raise ValueError('Active listing requires asking_price')
   if r.get('geometry'):
    if isinstance(r['geometry'],str):r['geometry']=json.loads(r['geometry'])
    from shapely.geometry import shape
    g=shape(r['geometry'])
    if g.geom_type not in ['Polygon','MultiPolygon']or not g.is_valid or g.is_empty:raise ValueError('Invalid parcel polygon')
   identity='|'.join([kind,r['geoid'],r['property_id'],r.get('closed_date',''),r.get('source_url','')]);r['id']=hashlib.sha256(identity.encode()).hexdigest()[:24];r['kind']=kind
   if r['id']not in seen:result.append(r);seen.add(r['id'])
  except (ValueError,TypeError,KeyError)as e:errors.append(f'Row {i}: {e}')
 return result,errors

def comps(records,market,p,kind,asof=None):
 asof=asof or dt.date.today();start=cutoff_date(asof,p.lookback_months);lo,hi=p.lot_target-p.lot_tolerance,p.lot_target+p.lot_tolerance
 matching=[];excluded=[]
 groups={}
 for row in records:
  if row.get('kind')!=kind or row['geoid']!=market['geoid']:continue
  identity=(row.get('parcel_id')or row.get('address')or row['property_id']).strip().lower()
  groups.setdefault((identity,row.get('closed_date')),[]).append(row)
 records=[]
 for key,group in groups.items():
  prices={r.get('sale_price')for r in group}
  if len(prices)>1:
   excluded.extend(dict(id=r['id'],reasons=['Conflicting sale prices for the same property/date'])for r in group);continue
  records.append(max(group,key=lambda r:r.get('confidence',0)))
 for r in records:
  reasons=[]
  if r.get('kind')!=kind or r['geoid']!=market['geoid']:continue
  if r['status']!='closed':reasons.append('Not a closed sale')
  if r.get('verification_status')not in ['verified','provider_reported']:reasons.append('Unverified sale')
  if r.get('confidence',0)<p.confidence:reasons.append('Below confidence threshold')
  date=dt.date.fromisoformat(r['closed_date'])
  if not start<=date<=asof:reasons.append('Outside lookback')
  if dt.date.fromisoformat(r['observed_at'][:10])>asof:reasons.append('Not observed by evaluation date')
  if not lo<=r['lot_acres']<=hi:reasons.append('Outside acreage tolerance')
  if r.get('days_on_market')is None:reasons.append('Days on market missing')
  elif r['days_on_market']>p.max_dom:reasons.append('Days on market exceeds limit')
  if reasons:excluded.append(dict(id=r['id'],reasons=reasons));continue
  item={**r};item['distance_miles']=haversine(market['lat'],market['lon'],r['latitude'],r['longitude'])if all(x is not None for x in [market.get('lat'),market.get('lon'),r.get('latitude'),r.get('longitude')])else None;matching.append(item)
 prices=[r['sale_price']for r in matching];n=len(prices);minimum=p.min_home_comps if kind=='homes'else p.min_lot_comps
 # Count equal windows so expanding lookback does not manufacture a volume trend.
 mid=asof-dt.timedelta(days=(asof-start).days//2);recent=sum(dt.date.fromisoformat(r['closed_date'])>mid for r in matching);prior=n-recent;volume=growth(recent,prior)
 summary=dict(count=n,minimum=minimum,sufficient=n>=minimum,median=quantile(prices,.5),q1=quantile(prices,.25),q3=quantile(prices,.75),median_sqft=quantile([r['sqft']for r in matching if r.get('sqft')],.5),median_age=quantile([asof.year-r['year_built']for r in matching if r.get('year_built')],.5),median_dom=quantile([r['days_on_market']for r in matching],.5),median_psf=quantile([r['sale_price']/r['sqft']for r in matching if r.get('sqft')],.5),volume_growth=volume,median_bedrooms=quantile([r['bedrooms']for r in matching if r.get('bedrooms')is not None],.5),median_bathrooms=quantile([r['bathrooms']for r in matching if r.get('bathrooms')is not None],.5),records=matching,excluded=excluded,coverage='county',expanded=False,confidence=quantile([r.get('confidence',0)for r in matching],.5),lookback_start=start.isoformat(),asof=asof.isoformat())
 summary['supported_exit']=summary['q1']if kind=='lots'and summary['sufficient']else None
 return summary

def residual(lots,exit_price,p,purchase=0):
 if not isinstance(lots,int)or lots<1 or not math.isfinite(exit_price)or exit_price<=0 or not math.isfinite(purchase)or purchase<0:raise ValueError('Positive integer yield, supported lot price and nonnegative purchase required')
 gross=lots*exit_price;dev=p.fixed_cost+lots*p.cost_per_lot;dev_total=dev*(1+p.contingency);selling=gross*p.selling_rate;holding=p.years*p.holding_annual+p.financing_cost
 nonland=dev_total+holding+selling+p.risk_reserve
 # Target ROC is profit / ALL project cost, including acquisition, not % of revenue.
 max_price=min(gross/(1+p.target_roc)-nonland,gross-nonland-p.min_profit);required_profit=gross-(max_price+nonland)
 total=purchase+nonland;net=gross-total;roc=net/total if total>0 else None;annual=(gross/total)**(1/p.years)-1 if total>0 else None
 return dict(lots=lots,exit_price=exit_price,gross=gross,development=dev_total,holding=holding,selling=selling,risk_reserve=p.risk_reserve,required_profit=required_profit,max_acquisition=max_price,target_offer=max(0,max_price*.9),total_cost=total,profit=net,roc=roc,annualized=annual,break_even_lot=(purchase+dev_total+holding+p.risk_reserve)/(lots*(1-p.selling_rate)),downside=residual_downside(lots,exit_price,p,purchase))
def residual_downside(lots,exit_price,p,purchase):
 gross=lots*exit_price*.9;cost=(p.fixed_cost+lots*p.cost_per_lot)*1.15*(1+p.contingency)+p.years*p.holding_annual+p.financing_cost+gross*p.selling_rate+p.risk_reserve+purchase
 return dict(gross=gross,total_cost=cost,profit=gross-cost,roc=(gross-cost)/cost if cost>0 else None)
def yield_and_checks(r,p):
 acres=r['lot_acres'];usable=acres*p.usable_fraction;potential=math.floor(usable/p.lot_target);limits=[potential];checks={}
 for key,required in [('road_access',True),('utilities',p.require_utilities),('legal_access_verified',True),('subdivision_verified',True),('geometry_verified',True)]:checks[key]=(not required)or r.get(key)is True
 if p.require_frontage:
  checks['frontage']=r.get('frontage_ft')is not None and r['frontage_ft']>=p.lot_frontage_ft
  if r.get('internal_road')is not True and r.get('frontage_ft')is not None:limits.append(math.floor(r['frontage_ft']/p.lot_frontage_ft))
 checks['town_distance']=r.get('town_miles')is not None and r['town_miles']<=p.town_miles
 checks['employment_travel']=r.get('employment_minutes')is not None and r['employment_minutes']<=p.commute_minutes
 checks['flood']=r.get('flood_fraction')is not None and r['flood_fraction']<=p.max_flood_fraction
 checks['topography']=r.get('slope')is not None and r['slope']<=p.max_slope
 checks['residential_use']=r.get('residential_use')is True
 checks['parcel_geometry']=bool(r.get('geometry'))
 checks['approved_yield']=r.get('approved_lot_count')is not None and r['approved_lot_count']>=1
 checks['septic_capacity']=r.get('septic_capacity')is not None and r['septic_capacity']>=1
 for k in ['approved_lot_count','septic_capacity']:
  if r.get(k)is not None:limits.append(math.floor(r[k]))
 lots=max(0,min(limits));return dict(potential_lots=lots,usable_acres=usable,checks=checks,verified=all(checks.values()),failed=[k for k,v in checks.items()if not v],feasibility_score=sum(checks.values())/len(checks)*100)
def public_score(m):
 vals=[(25,m.get('pop_growth'),lambda v:50+10*v),(10,m.get('pop_acceleration'),lambda v:50+15*v),(20,m.get('employment_growth'),lambda v:50+10*v),(15,m.get('permit_growth'),lambda v:50+v),(20,m.get('price_acceleration'),lambda v:50+3*v),(10,m.get('home_value_to_worker_pay'),lambda v:100-v*10)]
 available=[(w,max(0,min(100,f(v))))for w,v,f in vals if v is not None];return sum(w*v for w,v in available)/sum(w for w,v in available)if available else None

def search(markets,records,profile,asof=None):
 p=profile if isinstance(profile,SearchProfile)else SearchProfile(**profile);asof=asof or dt.date.today();results=[];skipped=[]
 for m in markets:
  if m['state']in p.exclusions or m['geoid']in p.exclusions:continue
  if m.get('pop_growth')is None or m['pop_growth']<p.min_pop_growth:continue
  home=comps(records,m,p,'homes',asof);lot=comps(records,m,p,'lots',asof)
  home_ok=home['sufficient']and home['volume_growth']is not None and home['volume_growth']>=p.min_sales_growth
  lot_ok=lot['sufficient']and lot['supported_exit']is not None and lot['supported_exit']>=p.min_lot_value
  public_conf=sum(m.get(k)is not None for k in ['pop_growth','employment_growth','permit_growth','price_growth','price_acceleration','home_value_to_worker_pay'])/6
  results.append(dict(market=m,momentum=public_score(m),public_confidence=public_conf,homes=home,lots=lot,home_pass=home_ok,lot_pass=lot_ok,stage='D · tract discovery'if home_ok and lot_ok else 'C · lot evidence needed'if home_ok else 'B · home evidence needed',candidates=[]))
 results.sort(key=lambda x:x['momentum']if x['momentum']is not None else -1,reverse=True)
 # Tiered shortlist: property providers are never called by this function.
 selected=results[:p.top_markets];bygeo={x['market']['geoid']:x for x in selected}
 for r in records:
  if r.get('kind')!='tracts' or r['geoid']not in bygeo:continue
  x=bygeo[r['geoid']];reasons=[]
  if not p.min_acres<=r['lot_acres']<=p.max_acres:reasons.append('Acreage outside profile')
  is_listing=r.get('status')=='active'and r.get('property_type')=='raw_land'and r.get('asking_price')is not None
  if is_listing and r['asking_price']/r['lot_acres']>p.max_price_acre:reasons.append('Asking price per acre exceeds cap')
  if r.get('confidence',0)<p.confidence:reasons.append('Below confidence threshold')
  if reasons:skipped.append(dict(property_id=r['property_id'],reasons=reasons));continue
  f=yield_and_checks(r,p);valuation=residual(f['potential_lots'],x['lots']['supported_exit'],p,r['asking_price']or 0)if f['potential_lots']>0 and x['lot_pass']else None
  confidence=min(r.get('confidence',0),x['homes']['confidence']or 0,x['lots']['confidence']or 0,x['public_confidence'])
  qualifies=is_listing and x['home_pass']and x['lot_pass']and f['verified']and confidence>=p.confidence and valuation and valuation['profit']>=p.min_profit and valuation['roc']>=p.target_roc
  scores=dict(momentum=x['momentum'],home_strength=min(100,x['homes']['count']/p.min_home_comps*75)if x['home_pass']else None,lot_demand=min(100,x['lots']['count']/p.min_lot_comps*75)if x['lot_pass']else None,acquisition_margin=max(0,min(100,(valuation['roc']or 0)/max(p.target_roc,.01)*75))if valuation else None,subdivision=f['feasibility_score'],confidence=confidence*100)
  # No composite investment score unless every gate passes.
  rank=sum(scores.values())/len(scores)if qualifies else None
  x['candidates'].append(dict(record=r,listing=is_listing,feasibility=f,valuation=valuation,qualifies=bool(qualifies),scores=scores,investment_score=rank,status='Qualified for review'if qualifies else 'Parcel inventory · not for sale'if not is_listing else 'Insufficient Evidence / profile gates not met'))
 opportunities=sorted([c for x in selected for c in x['candidates']if c['qualifies']],key=lambda c:c['investment_score'],reverse=True)
 return dict(profile=p.model_dump(),asof=asof.isoformat(),screened=len(markets),eligible_markets=len(results),shortlisted=len(selected),markets=selected,opportunities=opportunities,excluded_tracts=skipped,limitations=['Public demographic/economic vintages differ from current housing dates.','Missing property evidence prevents investment rankings; public momentum is not a deal score.','Potential acreage yield is not legal subdivision approval.','Sales volume is counts over equal half-lookback windows; price trends are descriptive, not repeat-property appreciation.'])

def vintage_backtest(observations,evaluation_date,scorer):
 usable=[o for o in observations if o['period']<=evaluation_date and o['available_at']<=evaluation_date]
 return scorer(usable)


def product_segments(summary,p):
 asof=dt.date.fromisoformat(summary['asof']);start=dt.date.fromisoformat(summary['lookback_start']);mid=asof-dt.timedelta(days=(asof-start).days//2);groups={}
 for r in summary['records']:
  size=int(r['sqft']//500)*500;key=f"{r.get('bedrooms') or '?'} beds / {size}–{size+499} sqft";groups.setdefault(key,[]).append(r)
 result=[]
 for key,rows in groups.items():
  recent=[r for r in rows if dt.date.fromisoformat(r['closed_date'])>mid];prior=[r for r in rows if dt.date.fromisoformat(r['closed_date'])<=mid];adequate=len(recent)>=5 and len(prior)>=5
  result.append(dict(product=key,count=len(rows),share=len(rows)/max(1,summary['count']),recent_count=len(recent),prior_count=len(prior),volume_growth=growth(len(recent),len(prior))if adequate else None,median_price_change=growth(quantile([r['sale_price']for r in recent],.5),quantile([r['sale_price']for r in prior],.5))if adequate else None,median_dom=quantile([r['days_on_market']for r in rows],.5),evidence='Two-period sample supported'if adequate else'Insufficient Evidence for trend'))
 return sorted(result,key=lambda r:r['count'],reverse=True)
