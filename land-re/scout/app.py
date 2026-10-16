import streamlit as st,pandas as pd,plotly.express as px,json,pathlib,csv,io,datetime as dt,os,hashlib
from config import SearchProfile
from analysis import search,residual,yield_and_checks,normalize_records,comps,product_segments
from database import Store
from connectors import RentCast,Regrid,Perplexity
ROOT=pathlib.Path(__file__).resolve().parent
st.set_page_config(page_title='Land Arbitrage Scout',page_icon='🌄',layout='wide')
st.markdown('''<style>.stApp{background:#f5f4ee}h1,h2,h3{color:#163e35}section[data-testid="stSidebar"]{background:#e7eae0}div[data-testid="stMetric"]{background:white;padding:16px;border-radius:12px;border:1px solid #dfe5d8}.stButton>button[kind="primary"]{background:#17604a}</style>''',unsafe_allow_html=True)
@st.cache_resource
def store():return Store(pathlib.Path(os.getenv('SCOUT_DATA_DIR')or str(ROOT/'data'))/'scout.duckdb')
@st.cache_data
def load_public():return json.loads((ROOT.parent/'scout-markets.json').read_text(encoding='utf-8-sig'))
DB=store();DATA=load_public();MARKETS=DATA['markets']
# Environment credentials stay server-side. No provider keys appear in the browser.
envpath=ROOT/'.env'
if envpath.exists():
 for line in envpath.read_text().splitlines():
  if '='in line and not line.lstrip().startswith('#'):
   k,v=line.split('=',1);os.environ.setdefault(k.strip(),v.strip().strip('"'))
SPECS=[('min_acres','Parent tract minimum · acres',1.,50.,.5),('max_acres','Parent tract maximum · acres',1.,100.,.5),('lot_target','Finished-lot target · acres',.5,5.,.1),('lot_tolerance','Finished-lot tolerance · ± acres',0.,2.,.1),('max_price_acre','Maximum asking price · $/acre',0.,100000.,500.),('min_home_comps','Minimum completed-home comps',1,100,1),('lookback_months','Comp lookback · months',3,120,1),('target_roc','Target return on total project cost · %',0.,100.,1.),('min_pop_growth','Minimum annual population growth · %',-5.,15.,.25),('town_miles','Maximum distance to small town · miles',1.,100.,1.),('commute_minutes','Maximum employment travel · minutes',5.,180.,5.),('min_lot_value','Minimum supported finished-lot exit · $',0.,300000.,1000.),('min_lot_comps','Minimum vacant finished-lot comps',1,100,1),('max_dom','Maximum days on market',0.,730.,5.),('min_sales_growth','Minimum home-sales volume growth · %',-100.,200.,5.),('min_profit','Minimum project profit · $',0.,500000.,5000.),('cost_per_lot','Roads / utilities / site cost per lot · $',0.,100000.,1000.),('fixed_cost','Survey / engineering / permits fixed cost · $',0.,200000.,1000.),('financing_cost','Financing cost · total $',0.,200000.,1000.),('contingency','Development contingency · %',0.,50.,1.),('years','Project holding period · years',.5,10.,.5),('holding_annual','Taxes / insurance / holding · $/year',0.,50000.,500.),('selling_rate','Selling costs · % of gross',0.,20.,.5),('risk_reserve','Additional risk reserve · $',0.,100000.,1000.),('usable_fraction','Usable tract area after constraints · %',10.,100.,1.),('lot_frontage_ft','Required lot frontage · ft',20.,400.,10.),('max_flood_fraction','Maximum flood-exposed area · %',0.,100.,1.),('max_slope','Maximum slope · degrees',0.,45.,1.),('confidence','Minimum evidence confidence · %',0.,100.,5.),('top_markets','Maximum Stage A markets advanced',1,100,1),('max_requests','Maximum paid requests per approved run',0,100,1)]
PERCENT={'target_roc','contingency','selling_rate','usable_fraction','max_flood_fraction','confidence'}
def load_profile():
 p=DB.profiles()[st.session_state.saved_profile]
 for k,_,lo,hi,step in SPECS:st.session_state['w_'+k]=p[k]*100 if k in PERCENT else p[k]
 for k in ['require_frontage','require_utilities']:st.session_state['w_'+k]=p[k]
 st.session_state['w_exclusions']=', '.join(p['exclusions'])
with st.sidebar:
 st.title('Search controls');profiles=DB.profiles()
 if profiles:
  st.selectbox('Saved search profile',list(profiles),key='saved_profile');st.button('Load saved profile',on_click=load_profile)
 values={};defaults=SearchProfile().model_dump()
 for i,(k,label,lo,hi,step)in enumerate(SPECS):
  if i==16:st.divider();st.subheader('Subdivision & underwriting')
  val=defaults[k]*100 if k in PERCENT else defaults[k];cast=int if isinstance(lo,int)else float
  values[k]=st.slider(label,cast(lo),cast(hi),cast(val),cast(step),key='w_'+k)
  if k in PERCENT:values[k]/=100
 values['require_frontage']=st.checkbox('Require documented road frontage',True,key='w_require_frontage');values['require_utilities']=st.checkbox('Require verified utility feasibility',True,key='w_require_utilities')
 values['exclusions']=[x.strip().upper()for x in st.text_input('Exclude states / county FIPS (comma separated)',key='w_exclusions').split(',')if x.strip()]
 name=st.text_input('Save profile as','Default rural tract strategy')
 try:PROFILE=SearchProfile(**values)
 except Exception as e:st.error(str(e));st.stop()
 if st.button('Save search profile'):DB.save_profile(name,PROFILE.model_dump());st.success('Saved to DuckDB')
 with st.expander('Import a saved profile JSON'):
  pf=st.file_uploader('Profile JSON',type=['json'],key='profile_import')
  if pf and st.button('Validate & save imported profile'):
   try:DB.save_profile(pf.name,SearchProfile(**json.load(pf)).model_dump());st.success('Saved; select and load it above.')
   except Exception as e:st.error(str(e))
st.caption('NATIONWIDE LAND DISCOVERY / EVIDENCE BEFORE OFFERS');st.title('Land Arbitrage Scout')
st.write('Early market signals → residential demand → finished-lot exits → parent tracts → verified feasibility → defensible offers.')
a,b=st.columns([2,1]);pressed=a.button('SEARCH NATIONWIDE',type='primary',width='stretch');b.caption('Public-data pre-screen and local records. This button never starts paid API calls.')
if pressed or'result'not in st.session_state:
 with st.spinner('Screening public markets and matching imported evidence…'):
  st.session_state.result=search(MARKETS,DB.records(),PROFILE);st.session_state.search_id=DB.save_search(st.session_state.result)
RESULT=st.session_state.result
if RESULT['profile']!=PROFILE.model_dump():st.info('Controls changed. SEARCH NATIONWIDE applies the updated profile. The subdivision calculator uses the current controls immediately.')
metrics=st.columns(4)
for col,label,v in zip(metrics,['Markets screened','Passed population screen','Advanced to property research','Qualified acquisition opportunities'],[RESULT['screened'],RESULT['eligible_markets'],RESULT['shortlisted'],len(RESULT['opportunities'])]):col.metric(label,v)
if not RESULT['opportunities']:st.warning('Insufficient Evidence for acquisition rankings. Import actual home sales, finished-lot sales and active parent listings with due-diligence fields; the application will not invent deals.')
short=RESULT['markets'];options={x['market']['name']+' · '+x['market']['geoid']:x for x in short}
selected=st.selectbox('Research market',list(options))if options else None;chosen=options.get(selected)if selected else None
TABS=st.tabs(['Nationwide Opportunity Map','Market Comparison','Residential Comp Explorer','Finished-Lot Market','Parent Tract Search','Subdivision Calculator','Investment Rankings','Data & Connectors'])
def market_frame():return pd.DataFrame([dict(Market=x['market']['name'],FIPS=x['market']['geoid'],State=x['market']['state'],Momentum=round(x['momentum'],1)if x['momentum']is not None else None,Population_growth=x['market'].get('pop_growth'),Employment_growth=x['market'].get('employment_growth'),Permit_growth=x['market'].get('permit_growth'),Home_value=x['market'].get('home_value'),Affordability_proxy=x['market'].get('home_value_to_worker_pay'),Home_comps=x['homes']['count'],Lot_comps=x['lots']['count'],Supported_lot_exit=x['lots']['supported_exit'],Confidence=x['public_confidence'],Stage=x['stage'],lat=x['market'].get('lat'),lon=x['market'].get('lon'))for x in short])
def records_frame(records):
 fields=['property_id','address','lot_acres','sqft','bedrooms','bathrooms','year_built','sale_price','closed_date','days_on_market','distance_miles','source_url','verification_status','observed_at']
 return pd.DataFrame([{k:r.get(k)for k in fields}for r in records])
with TABS[0]:
 st.subheader('Stage A · emerging market pre-screen');df=market_frame()
 if len(df):
  fig=px.scatter_geo(df.dropna(subset=['lat','lon']),lat='lat',lon='lon',color='Momentum',hover_name='Market',hover_data=['Population_growth','Employment_growth','Stage'],scope='usa',projection='albers usa',color_continuous_scale='Teal');fig.update_layout(height=500,margin=dict(l=0,r=0,t=0,b=0));st.plotly_chart(fig,width='stretch')
  st.dataframe(df.drop(columns=['lat','lon']),hide_index=True,width='stretch');st.download_button('Export market pre-screen CSV',df.to_csv(index=False),'market-prescreen.csv')
 st.caption('Map points are official county internal points, not parcel locations. Public momentum is a research score; property validation gates remain separate. Population/employment/permits: 2024; housing date varies by market.')
with TABS[1]:
 names=st.multiselect('Compare up to six markets',list(options),default=list(options)[:3],max_selections=6)
 compare=market_frame();st.dataframe(compare[compare['Market'].isin([options[n]['market']['name']for n in names])]if len(compare)else compare,hide_index=True,width='stretch')
 st.caption('Home value / average annual worker pay is a wage-based relative affordability proxy, not household mortgage affordability. Absorption requires active inventory; closed sales alone do not establish it.')
with TABS[2]:
 st.subheader('Stage B · completed-home demand')
 if chosen:
  h=chosen['homes'];st.write(f"{h['count']} eligible closed sales / {h['minimum']} required; geography: county; expanded: {h['expanded']}")
  if not chosen['home_pass']:st.warning('Insufficient Evidence: sample or configured sales-volume growth gate not met.')
  st.json({k:h[k]for k in ['median','q1','q3','median_sqft','median_age','median_bedrooms','median_bathrooms','median_dom','median_psf','volume_growth','confidence']})
  df=records_frame(h['records']);st.dataframe(df,hide_index=True,width='stretch',column_config={'source_url':st.column_config.LinkColumn('Source')})
  if len(df):st.plotly_chart(px.histogram(df,x='sale_price',nbins=15,title='Actual closed-price distribution'),width='stretch');st.plotly_chart(px.scatter(df,x='closed_date',y='sale_price',hover_name='address',title='Transactions over time · unadjusted prices'),width='stretch');st.download_button('Export selected home comps',df.to_csv(index=False),'home-comps.csv')
  st.subheader('Product characteristics and demand shifts');st.dataframe(pd.DataFrame(product_segments(h,PROFILE)),hide_index=True,width='stretch');st.caption('Trend results require at least five transactions per product in each equal time window. Median price change is unadjusted, not repeat-property appreciation.')
  with st.expander('Excluded records and reasons'):st.json(h['excluded'])
 st.caption('Only verified or provider-reported closed sales count. Unknown DOM, missing verification and records not observed by evaluation date are excluded. No silent radius/lookback expansion. Change the controls explicitly when evidence is thin.')
with TABS[3]:
 st.subheader('Stage C · vacant finished residential lots')
 if chosen:
  l=chosen['lots'];st.metric('Supported conservative exit / lot',f"${l['supported_exit']:,.0f}"if l['supported_exit']is not None else'Insufficient Evidence');st.write(f"{l['count']} transactions / {l['minimum']} required. Support uses the lower quartile, not a percentage of house prices.")
  st.dataframe(records_frame(l['records']),hide_index=True,width='stretch',column_config={'source_url':st.column_config.LinkColumn('Source')})
  if l['records']:st.plotly_chart(px.histogram(records_frame(l['records']),x='sale_price',title='Finished-lot sale distribution'),width='stretch')
  st.json({k:l[k]for k in ['median','q1','q3','median_dom','volume_growth','confidence']})
 st.caption('Raw acreage, agricultural sales and unclassified RentCast Land records cannot be treated as finished residential lots. Inadequate finished-lot evidence prevents supported underwriting.')
with TABS[4]:
 st.subheader('Stage D · parent tracts')
 if chosen:
  for c in chosen['candidates']:
   r=c['record'];st.markdown('#### '+r.get('address',r['property_id']));st.write(c['status']);st.write(dict(acres=r['lot_acres'],asking_price=r['asking_price'],price_per_acre=r['asking_price']/r['lot_acres']if r['asking_price']else None,potential_lots=c['feasibility']['potential_lots'],unverified_checks=c['feasibility']['failed']));st.link_button('Listing / parcel source',r['source_url'])
   if r.get('geometry'):st.json(r['geometry'],expanded=False)
   if c['valuation']:st.json(c['valuation'],expanded=False)
  if not chosen['candidates']:st.info('No actual matching tract listings or parcel inventory imported. Use CSV or an explicitly approved RentCast / Regrid search.')
 with st.expander('Excluded tracts'):st.json(RESULT['excluded_tracts'])
 st.caption('Regrid inventory is never labeled for sale. Legal access, frontage, utilities, flood, slope, geometry, septic, travel distances, residential use and approved yield are independently checked. Unknown fields do not pass.')
with TABS[5]:
 st.subheader('Stage E · residual valuation');a,b,c=st.columns(3);acres=a.number_input('Scenario parent acres',.5,1000.,7.5,.5);yield_guess=max(1,int(acres*PROFILE.usable_fraction/PROFILE.lot_target));lots=b.number_input('Scenario finished-lot count',1,100,yield_guess,1);support=chosen['lots']['supported_exit']if chosen else None;price=c.number_input('Exit price per finished lot · $',1.,1000000.,float(support or 50000),1000.);purchase=a.number_input('Scenario purchase price · $',0.,10000000.,75000.,1000.)
 st.caption('Current search controls supply development, financing, holding, profit and reserve assumptions. '+('Exit initialized from supported lower-quartile comps.'if support else'Exit is an illustrative manual assumption; not supported by completed-home values.'))
 if lots*PROFILE.lot_target>acres*PROFILE.usable_fraction:st.error('Scenario lot count exceeds the configured usable acreage before dimensional/engineering constraints.')
 else:
  v=residual(int(lots),price,PROFILE,purchase);cols=st.columns(4)
  for col,label,value in zip(cols,['Maximum acquisition','Net profit at purchase','Return on total cost','Annualized simplified return'],[f"${v['max_acquisition']:,.0f}",f"${v['profit']:,.0f}",f"{v['roc']:.1%}"if v['roc']is not None else'N/A',f"{v['annualized']:.1%}"if v['annualized']is not None else'N/A']):col.metric(label,value)
  st.json(v,expanded=False);rows=[]
  for exit_factor in [.9,1,1.1]:
   for cost_factor in [.85,1,1.15]:
    profile=PROFILE.model_copy(update={'cost_per_lot':PROFILE.cost_per_lot*cost_factor,'fixed_cost':PROFILE.fixed_cost*cost_factor});vv=residual(int(lots),price*exit_factor,profile,purchase);rows.append(dict(Exit_factor=exit_factor,Development_factor=cost_factor,Maximum_acquisition=vv['max_acquisition'],Profit=vv['profit']))
  st.dataframe(pd.DataFrame(rows),hide_index=True,width='stretch');st.download_button('Export underwriting JSON',json.dumps({'market':selected,'profile':PROFILE.model_dump(),'scenario':v,'confidence':'scenario assumptions; verify legal yield and exits'},indent=2),'underwriting.json')
 st.caption('Maximum acquisition = gross/(1 + target return on cost) − all non-land costs. Profit is defined on total project cost. Annualized return assumes costs at inception and exits at the end; it is not a staged cash-flow IRR.')
with TABS[6]:
 st.subheader('Investment rankings · all gates must pass')
 if not RESULT['opportunities']:st.info('Insufficient Evidence. No composite deal score is fabricated when comps, active listing, feasibility, confidence, minimum profit or return thresholds fail.')
 for c in RESULT['opportunities']:st.write(c['record']['address']if c['record'].get('address')else c['record']['property_id']);st.json({'score':c['investment_score'],'breakdown':c['scores'],'valuation':c['valuation']})
 st.download_button('Export complete search / evidence JSON',json.dumps(RESULT,indent=2),'land-arbitrage-search.json');st.download_button('Export current search profile',PROFILE.model_dump_json(indent=2),'scout-profile.json')
with TABS[7]:
 st.subheader('Import licensed exports / county records');kind=st.selectbox('Dataset kind',['homes','lots','tracts','mixed']);fields=['property_id','geoid','address','lot_acres','sqft','bedrooms','bathrooms','year_built','sale_price','closed_date','asking_price','days_on_market','property_type','status','verification_status','confidence','source_url','observed_at','latitude','longitude','finished','residential_use','road_access','utilities','legal_access_verified','frontage_ft','town_miles','employment_minutes','flood_fraction','slope','subdivision_verified','geometry_verified','approved_lot_count','septic_capacity','internal_road','geometry']
 st.download_button('Download CSV header template',','.join(fields)+'\r\n',kind+'-template.csv');file=st.file_uploader('CSV dataset',type=['csv'])
 if file and st.button('Validate & import CSV'):
  try:
   rows=list(csv.DictReader(io.StringIO(file.getvalue().decode('utf-8-sig'))));records=[];errors=[]
   if kind=='mixed':
    if any(r.get('kind')not in ['homes','lots','tracts']for r in rows):raise ValueError('Mixed backup requires a valid kind column')
    for k in ['homes','lots','tracts']:
     valid,err=normalize_records([r for r in rows if r['kind']==k],k);records.extend(valid);errors.extend(err)
   else:records,errors=normalize_records(rows,kind)
   if errors:st.error('\n'.join(errors[:20]))
   elif not records:st.error('No valid rows')
   else:DB.import_records(records);st.success(f'{len(records)} unique records upserted into DuckDB. Search again to apply them.')
  except Exception as e:st.error(str(e))
 st.write('Persistent property records:',len(DB.records()));st.download_button('Export property backup',json.dumps(DB.records(),indent=2),'property-backup.json')
 st.dataframe(pd.DataFrame(DATA['sources']),hide_index=True,width='stretch');st.caption('BEA requires a free API key. Source failures remain visible; they do not silently remove candidate markets.')
 st.subheader('Optional paid connectors · explicit approval per run');providers={'RentCast':RentCast(DB,geographies=MARKETS),'Regrid':Regrid(DB),'Perplexity / Sonar successor':Perplexity(DB)};pn=st.selectbox('Provider',list(providers));provider=providers[pn];mode=st.selectbox('RentCast dataset',['homes','lots','tracts']);n=st.number_input('Top markets to request',1,100,min(3,max(1,len(short))))
 if pn=='RentCast':queries=provider.queries([x['market']for x in short[:n]if x['market'].get('lat')is not None],PROFILE,mode)
 elif pn=='Regrid':queries=provider.queries([x['market']for x in short[:n]],PROFILE)
 else:queries=[{'question':x['market']['name']+' employer expansions, road projects, subdivision rules, septic and 1.5-acre residential demand','geoid':x['market']['geoid']}for x in short[:n]]
 plan=provider.plan(queries,PROFILE.max_requests);st.json(plan);approved=st.checkbox('I explicitly approve these paid requests and the displayed cost reservations for this run',False)
 if st.button('RUN APPROVED CONNECTOR REQUESTS',disabled=not(approved and plan['configured']and plan['within_search_limit'])):
  responses=provider.run(queries,PROFILE.max_requests,approved=True);st.session_state.provider_responses=responses
  imported=[];rejected=[]
  for item in responses:
   if item['status']!='ok':continue
   q=item['query']
   if pn=='RentCast':raw=[provider.normalize(r,mode,q['geoid'])for r in item['data']];valid,errors=normalize_records(raw,mode);imported.extend(valid);rejected.extend(errors)
   elif pn=='Regrid':raw=[provider.normalize(r,q['fields[geoid][eq]'])for r in item['data']['parcels']['features']];valid,errors=normalize_records(raw,'tracts');imported.extend(valid);rejected.extend(errors)
  if imported:DB.import_records(imported);st.success(f'{len(imported)} eligible records persisted. Search again to apply them.')
  if rejected:st.warning('Provider rows requiring review: '+'; '.join(rejected[:10]))
 if'provider_responses'in st.session_state:st.json(st.session_state.provider_responses,expanded=False)
 st.dataframe(pd.DataFrame(DB.usage()),hide_index=True);st.caption('Requests are cached for seven days and deduplicated. Failures keep conservative reservations because provider billing may still apply. Budgets cover this application only. No paid calls were executed during implementation.')
 st.info('Notion is optional. The connected Notion MCP can synchronize selected saved searches and summaries on request; the app works without it. Local notes / exports do not automatically sync.')

