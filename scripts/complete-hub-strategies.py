"""Complete gaps in existing hub strategy tables. Dry run unless --apply is supplied."""
import argparse,copy,datetime,json,pathlib,time
import importlib.util
_spec=importlib.util.spec_from_file_location("populate_hub_strategies",pathlib.Path(__file__).with_name("populate-hub-strategies.py"))
p=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(p)
ADDITIONS={
'owners-rep':['Bid & Scope Analysis','$500–$1,500 contractor bid comparison (pilot hypothesis)','Owner collecting bids → scoped review → payment → comparison report','Architect referrals; remodel and ADU owner outreach; bid-comparison SEO','Anonymized bid comparisons; scope-gap checklists; change-order prevention guides','3','Build a sample comparison report and interview five owners before setting the pilot price'],
'ai-implementation':['AI Workflow Audit','$250–$750 fixed-scope automation assessment (pilot hypothesis)','Targeted audit invitation → paid audit → prioritized report → optional implementation','Targeted B2B outreach; professional referrals; LinkedIn','Workflow bottleneck examples; before/after process maps; audit sample','3','Create a fixed-scope audit template and test the offer with five target businesses'],
'home-services':['Remote Property Assessments','$250–$750 photo/document-based maintenance planning report (pilot hypothesis)','Landlord inquiry → scope agreement and payment → document review → maintenance plan','Landlord outreach; property investor communities; remote maintenance SEO','Sample maintenance plans; photo-submission checklist; maintenance budgeting guides','3','Define a non-inspection planning scope and test demand with five landlords'],
'mountainwize':['Digital Decision Framework','$19–$79 decision workbook or mini-course (pilot hypothesis)','Decision-making content → free exercise → email sequence → workbook purchase','YouTube; email; decision-making SEO; relevant communities','Decision exercises; values trade-offs; practical framework walkthroughs','3','Publish one free exercise and test paid-workbook interest before creating a full course'],
'sunflower-acres':['Accessible Gardening Workshops','Paid adaptive-gardening workshop; pilot price to validate','Community partner invitation → registration and payment → hands-on workshop','Garden clubs; care providers; disability organizations; local community groups','Adaptive-tool demonstrations; raised-bed designs; practical growing activities','3','Design one accessible workshop and ask five partner organizations to recruit a pilot group'],
'creative-flow-guitar':['Personal Guitar Feedback Sessions','Paid live feedback session or personalized recorded critique; pilot price to validate','Technique video → student performance submission → paid feedback → practice plan','YouTube demonstrations; existing email list; music-community referrals','Before/after practice examples; focused technique corrections; sample feedback clips','3','Offer three paid pilot critiques and measure demand and delivery time'],
'multifamily-acquisitions':['Acquisition Screening Reports','Fixed-fee property screening and assumption-check report; pilot price to validate','Buyer submits deal documents → agreed research scope → payment → screening report','Buyer/operator outreach; CPA and property-manager referrals; underwriting SEO','Anonymized rent-roll checks; expense assumptions; due-diligence checklists','2','Build one sample report, verify data permissions, and test a fixed fee with three buyers']}
# Existing row IDs: extend matching ideas, never append a renamed duplicate.
ENRICH={
'care-gap':{
 'r1':{'Revenue Offer':'Restricted program grants and major gifts for defined caregiver-support outcomes; funding hypothesis','Funnel':'Aligned funder research → discovery meeting → costed pilot proposal → funding agreement → outcome report','Acquisition':'Foundation program officers; major-donor introductions; corporate giving teams','Priority':'1','Next Action':'Prepare one costed program pilot with measurable outcomes and shortlist 20 aligned funders'},
 'rmv9owsdh72y':{'Revenue Offer':'Organization-funded caregiver support pilot for retirement communities; pilot scope and budget to validate','Funnel':'Community director outreach → needs discussion → funded pilot agreement → delivery and evaluation','Acquisition':'Retirement-community directors; resident-services teams; local care-network introductions','Priority':'2','Next Action':'Interview five community directors and define a small funded pilot with a qualified delivery partner'},
 'rmv9ox2rv7vk':{'Revenue Offer':'Employer- or sponsor-funded caregiver education sessions; keep caregiver access free','Funnel':'HR or sponsor introduction → needs interview → scoped workshop proposal → sponsor payment → free caregiver session','Acquisition':'Employer HR and benefits teams; caregiver organizations; professional introductions','Priority':'3','Next Action':'Partner with a qualified caregiver educator and ask five employers about a sponsored educational session'}},
'multifamily-acquisitions':{
 'r1':{'Revenue Offer':'Fixed-fee buyer-specific deal research brief or research subscription; price to validate','Funnel':'Buyer outreach → written acquisition criteria → paid research pilot → verified shortlist → optional subscription','Acquisition':'Direct buyer/operator outreach; broker relationships; public or licensed property-data sources','Priority':'1','Next Action':'Interview five active buyers, confirm data-use permissions, and sell one fixed-scope research pilot'},
 'rmv9p06vpz5f':{'Revenue Offer':'Fixed-fee acquisition-market research and buyer-facing content package for sponsors; price to validate','Funnel':'Sponsor niche discussion → sample market brief → paid research/content package → optional monthly retainer','Acquisition':'Sponsor and operator outreach; professional referrals; acquisition-niche SEO','Priority':'3','Next Action':'Choose one acquisition niche and test a sample research/content brief with three sponsor teams'}}}


ADDITIONS['medicare-services-consulting']=['Care Navigation Toolkit','Paid non-clinical planning workbook and document checklist; pilot price to validate','Educational video ? free checklist ? paid toolkit ? self-guided planning','Educational YouTube; caregiver communities; partner newsletters','Appointment preparation; care-contact organizer; links to official Medicare and SHIP resources','3','Test a free checklist with five caregivers before creating the paid toolkit; exclude plan recommendations']
ENRICH['construction-project-management']={
 'rmv9p0xwb3hk':{'Revenue Offer':'Fixed-fee contractor project-controls setup: schedule, budget tracker and reporting workflow; pilot price to validate','Funnel':'Contractor introduction ? workflow review ? scoped paid setup ? handoff and training','Acquisition':'Small-contractor outreach; subcontractor and architect referrals; LinkedIn','Content':'Project scheduling examples; budget trackers; reporting workflow demonstrations','Priority':'1','Next Action':'Build one sample project-controls dashboard and interview five small contractors'},
 'r1':{'Revenue Offer':'Downloadable construction scheduling and cost-control toolkits; pilot price to validate','Funnel':'Practical tutorial ? free template sample ? paid toolkit ? optional setup help','Acquisition':'Construction-topic SEO; YouTube walkthroughs; contractor communities','Content':'Look-ahead schedule templates; change-log examples; cost-to-complete walkthroughs','Priority':'2','Next Action':'Test one free template and ask five contractors which additional tools they would pay for'}
}
ENRICH['medicare-services-consulting']={
 'rmv9p2uxyqyg':{'Revenue Offer':'Fixed-scope non-clinical care-planning and document-organization session; pilot fee to validate','Funnel':'Educational content ? scope/needs conversation ? paid planning session ? written organizer','Acquisition':'Caregiver referrals; elder-services organizations; educational SEO','Priority':'1','Next Action':'Define a non-clinical service scope and interview five caregivers; direct plan-selection questions to SHIP or an appropriately licensed professional'},
 'r1':{'Revenue Offer':'Organization-funded general Medicare education workshop; sponsor fee to validate','Funnel':'Community or employer outreach ? workshop proposal ? sponsor payment ? educational session','Acquisition':'Senior-community coordinators; employer benefits teams; local libraries and caregiver organizations','Priority':'2','Next Action':'Prepare an introductory workshop using official Medicare resources and seek a qualified co-presenter; do not promise plan sales or commissions'}
}

def prepare(slug,original):
    table=copy.deepcopy(original)
    if [c['name'] for c in table['columns']]!=p.HEADERS:
        # Reuse the tested mapping only; discard its unrelated seeding step.
        configured=p.transform('owners-rep',original)
        table['columns']=configured['columns']
    cols={c['name']:c['id'] for c in table['columns']}
    for row_id,fields in ENRICH.get(slug,{}).items():
        row=next((r for r in table['rows'] if r['id']==row_id),None)
        if row is None:raise ValueError(f'{slug}: missing existing initiative {row_id}')
        for name,value in fields.items():
            if not str(row.get('cells',{}).get(cols[name], '')).strip():row.setdefault('cells',{})[cols[name]]=value
    if slug in ADDITIONS:
        row_id='hsgap20261018-'+slug
        if not any(r['id']==row_id for r in table['rows']):
            values=ADDITIONS[slug]
            # Match by initiative text too, in case it was already added manually.
            if not any(str(r.get('cells',{}).get(cols['Strategy'],'')).strip().casefold()==values[0].casefold() for r in table['rows']):
                table['rows'].append({'id':row_id,'cells':{cols[name]:value for name,value in zip(p.HEADERS,values)}})
    assert len(table['columns'])==7
    for old,new in zip(original['rows'],table['rows']):
        assert old['id']==new['id']
        for k,v in old.get('cells',{}).items():assert new['cells'].get(k)==v,'existing cell overwritten'
    if table!=original:table['at']=int(time.time()*1000)
    return table

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    slugs=list(dict.fromkeys([*ADDITIONS,*ENRICH]))
    def read_tables():
        with p.concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:return dict(zip(slugs,pool.map(p.read,slugs)))
    before=read_tables()
    after={slug:prepare(slug,t) for slug,t in before.items()}
    for slug,t in after.items():assert prepare(slug,t)==t
    backup=p.ROOT/'_scratch'/('strategy-gaps-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'));backup.mkdir()
    (backup/'before.json').write_text(json.dumps(before,ensure_ascii=False,indent=2),encoding='utf-8')
    changed={slug:t for slug,t in after.items() if t!=before[slug]}
    for slug in slugs:print(f'{slug}: {len(before[slug]["rows"])} -> {len(after[slug]["rows"])} rows; old populated cells retained')
    print('Backup:',backup)
    if not args.apply:print('Dry run; no changes.');return
    if not changed:print('Already complete; no writes.');return
    assert read_tables()==before,'Concurrent edit detected; rerun'
    bulk=backup/'write.json';bulk.write_text(json.dumps([{'key':p.key(slug),'value':json.dumps(t,ensure_ascii=False)} for slug,t in changed.items()],ensure_ascii=False),encoding='utf-8')
    p.wrangler('kv','bulk','put',str(bulk),'--namespace-id',p.NAMESPACE,'--remote')
    (backup/'expected-after.json').write_text(json.dumps(after,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Saved {len(changed)} existing tables; read back after KV caches settle.')
if __name__=='__main__':main()
