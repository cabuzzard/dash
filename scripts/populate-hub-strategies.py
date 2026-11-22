"""One-time existing KV table update. Default is dry run; --apply writes eight keys only."""
import argparse,copy,concurrent.futures,datetime,json,pathlib,re,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
NAMESPACE='344c88fa8ca744fcbe25495b4701666d'
HEADERS=['Strategy','Revenue Offer','Funnel','Acquisition','Content','Priority','Next Action']
DATA={
'owners-rep':[
['Project Intelligence','$1,500–$3,000 project assessments','Prospect → consultation → paid review','Permit/property prospect research; personalized cold email; LinkedIn','Construction risk articles; project case studies','1','Identify 100 qualified project owners'],
['Owner Representation','Ongoing owner-side consulting','Assessment → proposal → engagement','Developer outreach; architect referrals; Google Search Ads',"Owner's rep guides; budget/schedule explainers",'2','Create consulting proposal template']],
'ai-implementation':[
['AI Receptionist','$500–$1,500 setup + support','Cold lead → demo → installation','Business prospect research; personalized cold email; demo outreach','YouTube demonstrations; ROI case studies','1','Build working receptionist demo'],
['Lead Automation','Setup fee + monthly support','Business audit → automation proposal → sale','Cold outreach; referrals; retargeting ads','Missed-lead tutorials; workflow demos','2','Package one repeatable automation']],
'home-services':[
['Local Repair Leads','$150–$600 repair packages','Google search → estimate → job','Google Search Ads; local SEO; neighborhood referrals','Before/after photos; service pages','1','Choose one profitable service to advertise'],
['Property Maintenance','Recurring maintenance agreements','Property manager → consultation → contract','Property manager outreach; referrals','Maintenance checklists; project examples','2','Build list of 50 property managers']],
'mountainwize':[
['Purpose Coaching','Paid coaching intensive','YouTube → landing page → application → session','YouTube organic; SEO; later Meta retargeting','Purpose, midlife reinvention, decision-making videos','1','Define and price coaching intensive'],
['Decision Coaching','Four-week coaching package','Free insight → email nurture → coaching package','YouTube Shorts; email; targeted partnerships','Decision paralysis; internal leadership; accountability','2','Create coaching offer landing page']],
'sunflower-acres':[
['Accessible Farm Visits','Paid group garden experiences','Organization → inquiry → group booking','Senior communities; disability organizations; activity coordinators','Accessible garden tours; testimonials; Facebook/Instagram','1','Contact 25 local organizations'],
['Farm Products','Produce, plants, subscriptions','Local discovery → order → purchase','Local Facebook groups; seasonal Meta ads; partnerships','Harvest videos; growing guides; product posts','2','Define first saleable product package']],
'creative-flow-guitar':[
['Guitar Sessions','Downloadable recordings and lessons','YouTube → free sample → checkout','YouTube organic; searchable video topics','Weekly recordings; guitar technique; riff Shorts','1','Publish first paid session'],
['Guitar Membership','Recurring access to recordings and lessons','Free content → email → membership','YouTube; email nurturing; later retargeting','Weekly lessons; exclusive performances','2','Define membership benefits and price']],
'surf-vacations':[
['Charter Referrals','Booking commissions','Destination search → inquiry → partner booking','Charter partnership outreach; SEO; targeted Google Ads','Destination guides; charter comparisons; surf-season articles','1','Secure three referral agreements'],
['Trip Planning','Paid custom surf-trip planning','Destination content → consultation → planning fee','SEO; surf communities; YouTube','Trip itineraries; logistics; destination comparisons','2','Define planning package and price']],
'sustainable-aquarium':[
['Walstad Consulting','Natural aquarium setup consultation','Tutorial → consultation booking → payment','SEO; YouTube; aquarium communities','Walstad setup tutorials; troubleshooting guides','1','Create paid consultation offer'],
['Affiliate & Guides','Equipment commissions; digital guides','Search → product comparison → purchase','SEO; YouTube; Pinterest','Equipment reviews; planted-tank comparisons','2',"Publish first buyer's guide"]]}
def key(slug):return 'infoflow:table:hubstrat-'+slug

def transform(slug,original):
    table=copy.deepcopy(original)
    cols=table['columns'];by_id={c['id']:c for c in cols}
    if [c['name'] for c in cols]==HEADERS:
        chosen=cols
    else:
        # Refuse unexpected schemas rather than guess, shift, or discard existing cells.
        if len(cols)!=4 or set(by_id)!={'c1','c2','c3','c4'}:
            raise ValueError(f'{slug}: unexpected schema; manual mapping needed')
        if by_id['c1']['name']!='Strategy' or by_id['c2']['name'] not in ('Goal','sub pages') or by_id['c3']['name']!='Status' or by_id['c4']['name']!='Post Ideas':
            raise ValueError(f'{slug}: changed headers; manual mapping needed')
        chosen=[by_id['c1'],by_id['c2'],{'id':'hsfunnel'}, {'id':'hsacquire'},by_id['c4'],{'id':'hspriority'},by_id['c3']]
        for col,name in zip(chosen,HEADERS):col['name']=name
        table['columns']=chosen
    assert len(chosen)==7 and len({c['id'] for c in chosen})==7
    allowed={c['id'] for c in chosen}
    for row in table['rows']:
        if not set(row.get('cells',{}))<=allowed:raise ValueError(f'{slug}: orphaned cell IDs')
    existing={r['id'] for r in table['rows']}
    for i,values in enumerate(DATA[slug],1):
        row_id=f'hs20261018-{slug}-{i}'
        if row_id not in existing:
            table['rows'].append({'id':row_id,'cells':{c['id']:value for c,value in zip(chosen,values)}})
    assert table['rows'][:len(original['rows'])]==original['rows']
    assert len(table['rows'])<=500
    # Match saveInfoFlowTable's persisted shape. No frontend initialization hook.
    if table!=original:table['at']=int(time.time()*1000)
    return table

def wrangler(*args):
    p=subprocess.run(['npx.cmd','wrangler@4',*args],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
    if p.returncode:raise RuntimeError(p.stderr+'\n'+p.stdout)
    return p.stdout.strip()
def read(slug):return json.loads(wrangler('kv','key','get',key(slug),'--namespace-id',NAMESPACE,'--remote','--text'))
def read_all():
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:return dict(zip(DATA,pool.map(read,DATA)))
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    # Match the same existing hub IDs in both application registries; storage itself is slug-keyed.
    registries=[]
    for filename in ('index.html','worker/worker.js'):
        src=(ROOT/filename).read_text(encoding='utf-8')
        block=re.search(r'const HUB_SITES = (\[[\s\S]*?\n\]);',src)[1]
        registries.append(dict(re.findall(r'slug:\s*"([^"]+)"[^\n]*?campaignId:\s*"([^"]+)"',block)))
    for slug in DATA:assert registries[0][slug]==registries[1][slug]
    before=read_all();after={slug:transform(slug,table) for slug,table in before.items()}
    backup=ROOT/'_scratch'/('hub-strategies-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(parents=True,exist_ok=False)
    (backup/'before.json').write_text(json.dumps(before,ensure_ascii=False,indent=2),encoding='utf-8')
    changed={slug:table for slug,table in after.items() if table!=before[slug]}
    for slug in DATA:
        assert transform(slug,after[slug])==after[slug], 'not idempotent'
        print(f'{slug} ({registries[0][slug]}): {len(before[slug]["rows"])} -> {len(after[slug]["rows"])} rows; 7 columns')
    print('Backup:',backup)
    if not args.apply:print('Dry run only. Use --apply to save.');return
    if not changed:print('Already populated; no writes.');return
    # Re-read immediately before writes to catch intervening operator edits.
    assert read_all()==before,'Tables changed during preparation; rerun without overwriting edits'
    bulk=backup/'write.json'
    bulk.write_text(json.dumps([{'key':key(slug),'value':json.dumps(table,ensure_ascii=False)} for slug,table in changed.items()],ensure_ascii=False),encoding='utf-8')
    wrangler('kv','bulk','put',str(bulk),'--namespace-id',NAMESPACE,'--remote')
    print(f'Saved {len(changed)} existing KV keys.')
    actual=read_all()
    assert actual==after,'Read-back mismatch; inspect backups before retrying'
    (backup/'verified-after.json').write_text(json.dumps(actual,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Verified {len(changed)} persisted tables. Original row data and IDs preserved; rerun is a no-op.')
if __name__=='__main__':main()
