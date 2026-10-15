"""Nationwide cycle-research refresh: Census + Zillow, SQLite and sharded history."""
import csv,io,json,sqlite3,urllib.request,datetime,pathlib,argparse,math
ROOT=pathlib.Path(__file__).resolve().parent
BASE='https://files.zillowstatic.com/research/public_csvs/'
SOURCES={
'census':('https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv','US Census population and migration, vintage 2024','population.csv'),
'metro_zhvi':(BASE+'zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv','Zillow metro / national ZHVI','metro.csv'),
'state_zhvi':(BASE+'zhvi/State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv','Zillow state ZHVI','state.csv'),
'county_zhvi':(BASE+'zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv','Zillow county ZHVI','county.csv'),
'inventory':(BASE+'invt_fs/Metro_invt_fs_uc_sfrcondo_sm_month.csv','Zillow active for-sale inventory','inventory.csv'),
'sales':(BASE+'sales_count_now/Metro_sales_count_now_uc_sfrcondo_month.csv','Zillow sales counts (latest months nowcast)','sales.csv'),
'pending':(BASE+'mean_doz_pending/Metro_mean_doz_pending_uc_sfrcondo_sm_month.csv','Zillow mean days to pending','pending.csv')}
ABBR=dict(zip('Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming'.split('|'),'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split()))
REGIONS={**dict.fromkeys('CT ME MA NH RI VT NJ NY PA'.split(),'Northeast'),**dict.fromkeys('IN IL MI OH WI IA KS MN MO NE ND SD'.split(),'Midwest'),**dict.fromkeys('DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX'.split(),'South'),**dict.fromkeys('AZ CO ID MT NV NM UT WY AK CA HI OR WA'.split(),'West')}
def refresh(use_cache=False):
 data=ROOT/'data';raw=data/'raw';raw.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(data/'national.sqlite3');db.execute('CREATE TABLE IF NOT EXISTS national_observations (id TEXT,metric TEXT,period TEXT,value REAL,source TEXT,observed_at TEXT,PRIMARY KEY(id,metric,period,source))');db.execute('CREATE TABLE IF NOT EXISTS national_geographies (id TEXT PRIMARY KEY,metadata TEXT)');db.execute('CREATE TABLE IF NOT EXISTS national_source_health (id TEXT PRIMARY KEY,url TEXT,observed_at TEXT,status TEXT,detail TEXT)')
 stamp=datetime.datetime.now(datetime.timezone.utc).isoformat();health=[];meta={}
 def geography(id,name,level,state='',states=None):
  m=meta.setdefault(id,dict(geoid=id,name=name,level=level,state=state,states=states or ([state] if state else []),region=REGIONS.get(state,'National' if level=='national' else 'Other'),population=[],net_migration=[],zhvi=[],inventory=[],sales=[],pending=[],provenance={}))
  return m
 for key,(url,title,cache) in SOURCES.items():
  try:
   cached=ROOT/cache
   if use_cache and cached.exists():payload=cached.read_bytes()
   else:payload=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'LandRE/2.0 public-data research'}),timeout=90).read()
   rows=list(csv.DictReader(io.StringIO(payload.decode('latin1' if key=='census' else 'utf-8-sig'))));assert rows and ('POPESTIMATE2024' if key=='census' else 'RegionID') in rows[0],'Unexpected schema'
   (raw/(key+'-'+stamp[:10]+'.csv')).write_bytes(payload);count=0
   db.execute('SAVEPOINT provider')
   for r in rows:
    if key=='census':
     st=ABBR.get(r['STNAME']);
     if not st:continue
     is_state=r['COUNTY']=='000';id='state:'+st if is_state else r['STATE'].zfill(2)+r['COUNTY'].zfill(3)
     m=geography(id,r['CTYNAME']+('' if is_state else ', '+st),'state' if is_state else 'county',st);m['provenance'].update(population=key,net_migration=key)
     values=[(metric,str(y),float(r[col+str(y)]))for y in range(2020,2025) for metric,col in [('population','POPESTIMATE'),('net_migration','NETMIG')] if r.get(col+str(y))]
    else:
     rt=r['RegionType'];state=r.get('StateName') or r.get('State') or '';name=r['RegionName']
     if key=='county_zhvi':
      if r.get('State') not in REGIONS:continue
      state=r['State'];id=r['StateCodeFIPS'].zfill(2)+r['MunicipalCodeFIPS'].zfill(3);level='county';name+=', '+state
     elif key=='state_zhvi':
      state=ABBR.get(name,'');
      if not state:continue
      id='state:'+state;level='state'
     else:id='us' if rt=='country' else 'metro:'+r['RegionID'];level='national' if rt=='country' else 'metro'
     states=[s for s in name.split(', ')[-1].split('-') if s in REGIONS] if level=='metro' else ([state] if state else [])
     m=geography(id,name,level,state,states);metric='zhvi' if key.endswith('zhvi') else key;m['provenance'][metric]=key
     values=[(metric,k,round(float(v),3))for k,v in r.items() if len(k)==10 and k[4]=='-' and v]
    for metric,period,value in values:
     if not math.isfinite(value) or (value<0 and metric!='net_migration'):continue
     db.execute('INSERT OR REPLACE INTO national_observations VALUES(?,?,?,?,?,?)',(id,metric,period,value,key,stamp));count+=1
   for id,m in meta.items():db.execute('INSERT OR REPLACE INTO national_geographies VALUES(?,?)',(id,json.dumps(m)))
   db.execute('RELEASE provider');db.commit();status='ok';detail=f'{count:,} nationwide observations ingested'
  except Exception as e:
   try:db.execute('ROLLBACK TO provider');db.execute('RELEASE provider')
   except sqlite3.Error:pass
   status='error';detail=f'{type(e).__name__}: {e}'
  health.append(dict(id=key,title=title,url=url,observed_at=stamp,status=status,detail=detail));db.execute('INSERT OR REPLACE INTO national_source_health VALUES(?,?,?,?,?)',(key,url,stamp,status,detail));db.commit()
 for id,metadata in db.execute('SELECT * FROM national_geographies'):
  if id not in meta:meta[id]=json.loads(metadata)
 for id,metric,period,value,source,observed_at in db.execute('SELECT * FROM national_observations ORDER BY period'):
  if id in meta:meta[id][metric].append(dict(date=period,value=value))
 # National demographics are summed from nonoverlapping 50-state + DC estimates.
 us=meta.get('us')
 if us:
  for metric in ['population','net_migration']:
   states=[m for m in meta.values() if m['level']=='state' and m[metric]]
   us[metric]=[dict(date=str(y),value=sum(next((p['value'] for p in m[metric] if p['date']==str(y)),0)for m in states))for y in range(2020,2025)];us['provenance'][metric]='census'
 histories={};summaries=[]
 for m in meta.values():
  if not m['zhvi'] and not m['population']:continue
  m['price_peak']=max((p['value'] for p in m['zhvi']),default=None)
  m['history_start']=m['zhvi'][0]['date'] if m['zhvi'] else None
  bucket=m['level']+'-'+(m['state'] or 'US');path='history/'+bucket+'.json';m['history_file']=path
  histories.setdefault(path,{})[m['geoid']]=m
  compact={**m}
  for metric in ['zhvi','inventory','sales','pending']:compact[metric]=m[metric][-73:]
  summaries.append(compact)
 out=ROOT/'history';out.mkdir(exist_ok=True)
 for path,records in histories.items():(ROOT/path).write_text(json.dumps(records,separators=(',',':')),encoding='utf-8')
 result=dict(schema=2,generated_at=stamp,markets=summaries,sources=health,limitations=['Cycle labels describe observed housing indicators; they do not predict land appreciation.','Population / migration vintage ends in 2024. Metro population is not inferred from counties.','Metro inventory, sales and days-to-pending coverage varies; state/county scans have price and demographic coverage only.','Revised current-vintage series are not point-in-time backtests.','Employment, permits, infrastructure, affordability and land-price evidence still require research.','Metro state filters include states named by the provider; metros can cross state boundaries.'])
 target=ROOT/'markets.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps(result,separators=(',',':')),encoding='utf-8');temp.replace(target)
 print(json.dumps(dict(markets=len(summaries),levels={level:sum(m['level']==level for m in summaries)for level in ['national','state','metro','county']},sources=health),indent=2))
 if not us or not any(m['level']=='metro' for m in summaries):raise SystemExit('No national/metro housing coverage; do not publish without checking health')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--use-cache',action='store_true',help='Development only: ingest previously downloaded official CSVs');refresh(p.parse_args().use_cache)
