"""Reproducible, dependency-free public-data refresh. SQLite stores bulk observations."""
import csv, io, json, sqlite3, urllib.request, datetime, pathlib, argparse, os
ROOT=pathlib.Path(__file__).resolve().parent
SOURCES={
 'census':('https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv','US Census county population estimates, vintage 2024'),
 'zillow':('https://files.zillowstatic.com/research/public_csvs/zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv','Zillow Research county ZHVI, all homes, smoothed seasonally adjusted')}
def refresh():
 data=ROOT/'data'; raw=data/'raw'; raw.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(data/'land.sqlite3')
 db.execute('CREATE TABLE IF NOT EXISTS observations (geoid TEXT, metric TEXT, period TEXT, value REAL, source TEXT, observed_at TEXT, PRIMARY KEY(geoid,metric,period,source))')
 db.execute('CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, url TEXT, observed_at TEXT, status TEXT, detail TEXT)')
 stamp=datetime.datetime.now(datetime.timezone.utc).isoformat(); health=[]; names={}; markets={}
 for key,(url,title) in SOURCES.items():
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'LandRE/1.0 research'})
   payload=urllib.request.urlopen(req,timeout=90).read()
   rows=list(csv.DictReader(io.StringIO(payload.decode('utf-8-sig' if key=='zillow' else 'latin1'))))
   if not rows or ('POPESTIMATE2024' if key=='census' else 'RegionID') not in rows[0]: raise ValueError('Unexpected source schema')
   (raw/(key+'-'+stamp[:10]+'.csv')).write_bytes(payload)
   count=0
   for r in rows:
    if key=='census':
     if r['STATE']!='48' or r['COUNTY']=='000': continue
     geoid=r['STATE'].zfill(2)+r['COUNTY'].zfill(3); names[geoid]=r['CTYNAME']; values=[]
     for year in range(2020,2025):
      for metric,col in [('population','POPESTIMATE'),('net_migration','NETMIG')]:
       v=r.get(col+str(year),'')
       if v: values.append((metric,str(year),float(v)))
    else:
     if r['State']!='TX': continue
     geoid=r['StateCodeFIPS'].zfill(2)+r['MunicipalCodeFIPS'].zfill(3); names.setdefault(geoid,r['RegionName'])
     values=[('zhvi',k,float(v)) for k,v in r.items() if len(k)==10 and k[4]=='-' and v]
    for metric,period,value in values:
     if value<0 and metric!='net_migration': continue
     db.execute('INSERT OR REPLACE INTO observations VALUES(?,?,?,?,?,?)',(geoid,metric,period,value,key,stamp)); count+=1
   status='ok'; detail=f'{count} Texas observations ingested'
  except Exception as e: status='error'; detail=f'{type(e).__name__}: {e}'
  db.execute('INSERT OR REPLACE INTO sources VALUES(?,?,?,?,?)',(key,url,stamp,status,detail)); db.commit()
  health.append(dict(id=key,url=url,title=title,observed_at=stamp,status=status,detail=detail))
 for geoid,metric,period,value,source,observed in db.execute('SELECT * FROM observations ORDER BY period'):
  m=markets.setdefault(geoid,dict(geoid=geoid,name=names.get(geoid,geoid),population=[],zhvi=[],net_migration=[]))
  m[metric].append(dict(date=period,value=value,source=source,observed_at=observed))
 result=dict(generated_at=stamp,markets=list(markets.values()),sources=health,limitations=['Population vintage ends in 2024; download vintage is intentionally pinned for reproducibility.','ZHVI is a modeled home-value index, not land prices or individual closed sales.','Scoring is a screening heuristic, not a validated forecast or probability.','Permits, employment, parcel GIS, municipal boundaries, ETJ, floodplain and property sales require additional sources.'])
 target=ROOT/'markets.json'; temporary=target.with_suffix('.tmp'); temporary.write_text(json.dumps(result,separators=(',',':')),encoding='utf-8'); temporary.replace(target)
 print(json.dumps(dict(markets=len(markets),sources=health),indent=2))
 if not markets: raise SystemExit('No observations ingested; inspect data health')
if __name__=='__main__': refresh()
