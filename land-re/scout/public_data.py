import csv,json,datetime as dt,pathlib,urllib.request,zipfile,io,math
ROOT=pathlib.Path(__file__).resolve().parent
SOURCES={
'census':'https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv',
'county_zhvi':'https://files.zillowstatic.com/research/public_csvs/zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv',
'gazetteer':'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip',
'permits2023':'https://www2.census.gov/econ/bps/County/co2023a.txt','permits2024':'https://www2.census.gov/econ/bps/County/co2024a.txt',
'employment2023':'https://data.bls.gov/cew/data/api/2023/a/industry/10.csv','employment2024':'https://data.bls.gov/cew/data/api/2024/a/industry/10.csv'}
def refresh():
 from database import Store
 from analysis import growth
 store=Store(ROOT/'data/scout.duckdb');raw=ROOT/'data/raw';raw.mkdir(parents=True,exist_ok=True);stamp=dt.datetime.now(dt.timezone.utc).isoformat();sources=[];datasets={}
 for key,url in SOURCES.items():
  try:
   b=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'LandArbitrageScout/1.0 public-data research'}),timeout=90).read();(raw/(key+'-'+stamp[:10]+'.raw')).write_bytes(b)
   if key=='gazetteer':z=zipfile.ZipFile(io.BytesIO(b));b=z.read(z.namelist()[0])
   text=b.decode('latin1'if key=='census'else'utf-8-sig')
   if key.startswith('permits'):
    rows=list(csv.reader(text.splitlines()))[3:];datasets[key]={r[1].zfill(2)+r[2].zfill(3):sum(int(r[i]or 0)for i in [7,10,13,16])for r in rows if len(r)>17 and r[0].strip().isdigit()}
   else:datasets[key]=list(csv.DictReader(text.splitlines(),delimiter='\t'if key=='gazetteer'else','))
   if not datasets[key]:raise ValueError('Empty provider dataset')
   status='ok';detail=str(len(datasets[key]))+' records'
  except Exception as e:status='error';detail=type(e).__name__+': '+str(e);datasets[key]={}if key.startswith('permits')else[]
  sources.append(dict(id=key,title=key,url=url,status=status,detail=detail,observed_at=stamp))
 # Retain prior rows when an optional source fails, marking stale provider health.
 previous=ROOT.parent/'scout-markets.json';prior=json.loads(previous.read_text())if previous.exists()else{'markets':[]};prior_geo={m['geoid']:m for m in prior['markets']};markets={}
 for r in datasets.get('census',[]):
  if r['COUNTY']=='000' or r['STATE']=='72':continue
  g=r['STATE'].zfill(2)+r['COUNTY'].zfill(3);p=[float(r['POPESTIMATE'+str(y)])for y in range(2020,2025)];a=growth(p[-1],p[-2]);prev=growth(p[-2],p[-3]);old=prior_geo.get(g,{})
  markets[g]={**old,'geoid':g,'name':r['CTYNAME']+', '+r['STNAME'],'state':old.get('state',r['STNAME']),'region':old.get('region',{'1':'Northeast','2':'Midwest','3':'South','4':'West'}.get(r['REGION'],'Other')),'population':p[-1],'pop_growth':a,'pop_acceleration':a-prev if a is not None and prev is not None else None,'pop_period':'2024','source_observed_at':stamp}
 if not markets:markets=prior_geo
 for r in datasets.get('gazetteer',[]):
  if r['GEOID']in markets:
   m=markets[r['GEOID']];m.update(state=r['USPS'],lat=float(r['INTPTLAT']),lon=float(r[next(k for k in r if k.startswith('INTPTLONG'))]))
 def month(date,n):
  y,m=map(int,date[:7].split('-'));v=y*12+m-1+n;return f'{v//12:04d}-{v%12+1:02d}'
 for r in datasets.get('county_zhvi',[]):
  g=r['StateCodeFIPS'].zfill(2)+r['MunicipalCodeFIPS'].zfill(3)
  if g not in markets:continue
  z=[dict(date=k,value=float(v))for k,v in r.items()if len(k)==10 and k[4]=='-'and v];m=markets[g]
  if not z:continue
  end=z[-1]['date'];values={p['date'][:7]:p['value']for p in z};val=lambda off:values.get(month(end,off));annual=growth(val(0),val(-12));q=growth(val(0),val(-3));oldq=growth(val(-3),val(-6));pace=(1+q/100)**4*100-100 if q is not None else None;prevpace=(1+oldq/100)**4*100-100 if oldq is not None else None;acc=pace-prevpace if pace is not None and prevpace is not None else None;drawdown=(val(0)/max(p['value']for p in z)-1)*100
  cycle='Insufficient history'
  if annual is not None and pace is not None:
   cycle='Correction'if annual<-2 and pace<=0 else'Recovery'if drawdown<-3 and pace>0 and acc is not None and acc>0 else'Cooling'if pace<annual-2 else'Expansion'if annual>6 and pace>0 else'Stabilizing / mixed'
  m.update(home_value=val(0),price_growth=annual,price_acceleration=acc,cycle=cycle,price_period=end,price_history=[p for p in z if p['date'].endswith('12-31')or p==z[-1]])
 for year in [2023,2024]:
  for r in datasets.get('employment'+str(year),[]):
   if r['area_fips']in markets and r['own_code']=='0'and r['agglvl_code']=='70'and not r['disclosure_code'].strip():
    m=markets[r['area_fips']];m['employment_'+str(year)]=float(r['annual_avg_emplvl']);m['pay_'+str(year)]=float(r['avg_annual_pay'])
 for g,m in markets.items():
  if m.get('employment_2023')and m.get('employment_2024'):m['employment_growth']=growth(m['employment_2024'],m['employment_2023'])
  m['employment_period']='2024';m['permit_period']='2024';p24=datasets.get('permits2024',{});p23=datasets.get('permits2023',{})
  if g in p24:m.update(permits=p24[g],permit_growth=growth(p24[g],p23.get(g)),permits_per_1000=p24[g]/m['population']*1000 if m.get('population')else None)
  if m.get('pay_2024')and m.get('home_value'):m['home_value_to_worker_pay']=m['home_value']/m['pay_2024']
  for k in ['employment_growth','permits','permit_growth','price_growth','price_acceleration','home_value_to_worker_pay','home_value','lat','lon']:m.setdefault(k,None)
  m.setdefault('price_history',[]);m.setdefault('price_period',None);m.setdefault('cycle','Insufficient history')
 rows=[]
 for m in markets.values():
  for metric,period in [('pop_growth','2024'),('employment_growth','2024'),('permits','2024'),('permit_growth','2024'),('home_value',m['price_period'])]:
   if m.get(metric)is not None:rows.append([m['geoid'],metric,period,m[metric],'public refresh',stamp])
 with store.connect()as db:
  db.execute('BEGIN')
  try:
   db.executemany('INSERT OR REPLACE INTO market_observations VALUES(?,?,?,?,?,?)',rows);db.execute('COMMIT')
  except Exception:db.execute('ROLLBACK');raise
 try:
  from connectors import BEA
  for r in BEA().regional():
   g=r['GeoFips'];v=float(r['DataValue'].replace(',',''));markets.get(g,{})['bea_gdp_'+r['TimePeriod']]=v
  sources.append(dict(id='bea',title='BEA regional GDP',url='https://apps.bea.gov/api/data/',status='ok',observed_at=stamp))
 except Exception as e:sources.append(dict(id='bea',title='BEA regional GDP',url='https://apps.bea.gov/api/signup/',status='unavailable',detail=type(e).__name__+': '+str(e),observed_at=stamp))
 output=dict(name='Land Arbitrage Scout',generated_at=stamp,markets=list(markets.values()),sources=sources);tmp=previous.with_suffix('.tmp');tmp.write_text(json.dumps(output,separators=(',',':')),encoding='utf-8');tmp.replace(previous);print(json.dumps({'markets':len(markets),'sources':sources},indent=2))
if __name__=='__main__':refresh()

