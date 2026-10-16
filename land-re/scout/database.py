import datetime as dt,json,hashlib,pathlib,threading,duckdb
LOCK=threading.RLock()
class Store:
 def __init__(self,path):
  self.path=str(path);pathlib.Path(path).parent.mkdir(parents=True,exist_ok=True)
  with LOCK,self.connect()as db:
   db.execute('CREATE TABLE IF NOT EXISTS records (kind VARCHAR,id VARCHAR,geoid VARCHAR,payload JSON,observed_at VARCHAR,PRIMARY KEY(kind,id))')
   db.execute('CREATE TABLE IF NOT EXISTS profiles (name VARCHAR PRIMARY KEY,payload JSON,updated_at VARCHAR)')
   db.execute('CREATE TABLE IF NOT EXISTS searches (id VARCHAR PRIMARY KEY,created_at VARCHAR,profile JSON,result JSON)')
   db.execute('CREATE TABLE IF NOT EXISTS cache (key VARCHAR PRIMARY KEY,provider VARCHAR,payload JSON,expires_at VARCHAR)')
   db.execute('CREATE TABLE IF NOT EXISTS usage (id VARCHAR PRIMARY KEY,provider VARCHAR,month VARCHAR,reserved_cost DOUBLE,status VARCHAR,created_at VARCHAR)')
   db.execute('CREATE TABLE IF NOT EXISTS research (id VARCHAR PRIMARY KEY,market VARCHAR,payload JSON,created_at VARCHAR)')
   db.execute('CREATE TABLE IF NOT EXISTS market_observations (geoid VARCHAR,metric VARCHAR,period VARCHAR,value DOUBLE,source VARCHAR,observed_at VARCHAR,PRIMARY KEY(geoid,metric,period,source))')
 def connect(self):return duckdb.connect(self.path)
 def import_records(self,records):
  with LOCK,self.connect()as db:
   db.execute('BEGIN')
   try:
    for r in records:db.execute('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?)',[r['kind'],r['id'],r['geoid'],json.dumps(r),r['observed_at']])
    db.execute('COMMIT')
   except Exception:db.execute('ROLLBACK');raise
 def records(self):
  with LOCK,self.connect()as db:return [json.loads(r[0])for r in db.execute('SELECT payload FROM records').fetchall()]
 def save_profile(self,name,p):
  with LOCK,self.connect()as db:db.execute('INSERT OR REPLACE INTO profiles VALUES(?,?,?)',[name,json.dumps(p),dt.datetime.now(dt.timezone.utc).isoformat()])
 def profiles(self):
  with LOCK,self.connect()as db:return {r[0]:json.loads(r[1])for r in db.execute('SELECT name,payload FROM profiles').fetchall()}
 def save_search(self,result):
  now=dt.datetime.now(dt.timezone.utc).isoformat();id=hashlib.sha256((now+json.dumps(result['profile'])).encode()).hexdigest()[:20]
  with LOCK,self.connect()as db:db.execute('INSERT INTO searches VALUES(?,?,?,?)',[id,now,json.dumps(result['profile']),json.dumps(result)])
  return id
 def cached(self,key):
  with LOCK,self.connect()as db:
   r=db.execute('SELECT payload,expires_at FROM cache WHERE key=?',[key]).fetchone()
   return json.loads(r[0])if r and r[1]>dt.datetime.now(dt.timezone.utc).isoformat()else None
 def cache(self,key,provider,payload,days=7):
  expires=(dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=days)).isoformat()
  with LOCK,self.connect()as db:db.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?,?)',[key,provider,json.dumps(payload),expires])
 def usage(self):
  month=dt.date.today().isoformat()[:7]
  with LOCK,self.connect()as db:return [dict(provider=r[0],requests=r[1],reserved_cost=r[2])for r in db.execute('SELECT provider,count(*),sum(reserved_cost) FROM usage WHERE month=? GROUP BY provider',[month]).fetchall()]
 def reserve(self,provider,cost,budget):
  import uuid
  month=dt.date.today().isoformat()[:7];id=str(uuid.uuid4())
  with LOCK,self.connect()as db:
   db.execute('BEGIN')
   try:
    used=db.execute('SELECT coalesce(sum(reserved_cost),0) FROM usage WHERE provider=? AND month=?',[provider,month]).fetchone()[0]
    if used+cost>budget+1e-9:raise PermissionError('Monthly spending reservation limit reached; paused')
    db.execute('INSERT INTO usage VALUES(?,?,?,?,?,?)',[id,provider,month,cost,'reserved',dt.datetime.now(dt.timezone.utc).isoformat()]);db.execute('COMMIT')
   except Exception:db.execute('ROLLBACK');raise
  return id
 def finish(self,id,status):
  with LOCK,self.connect()as db:db.execute('UPDATE usage SET status=? WHERE id=?',[status,id])
