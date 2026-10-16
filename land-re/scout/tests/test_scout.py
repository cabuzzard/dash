import datetime as dt,json,math,pytest,httpx
from config import SearchProfile
from analysis import normalize_records,comps,residual,yield_and_checks,search,haversine,vintage_backtest
from database import Store
from connectors import RentCast,Regrid,Perplexity
ASOF=dt.date(2026,10,15)
def home(i):return dict(property_id=f'SYNTHETIC_HOME_{i}',geoid='48423',address=f'SYNTHETIC TEST {i}',lot_acres='1.5',sqft='2200',bedrooms='3',bathrooms='2',year_built='2015',sale_price=str(350000+i*1000),closed_date='2026-06-01'if i<8 else'2025-01-01',days_on_market='40',property_type='single_family',status='closed',verification_status='verified',confidence='1',source_url='https://example.test/fixture',observed_at='2026-10-01')
def lot(i):return dict(property_id=f'SYNTHETIC_LOT_{i}',geoid='48423',lot_acres='1.5',sale_price=str(100000+i*1000),closed_date='2026-06-01',days_on_market='30',property_type='finished_lot',finished='true',residential_use='true',status='closed',verification_status='verified',source_url='https://example.test/fixture',observed_at='2026-10-01')
def tract():return dict(property_id='SYNTHETIC_PARENT',geoid='48423',lot_acres='7.5',asking_price='75000',property_type='raw_land',status='active',verification_status='verified',source_url='https://example.test/fixture',observed_at='2026-10-01',town_miles='5',employment_minutes='30',frontage_ft='600',flood_fraction='0',slope='2',approved_lot_count='3',septic_capacity='3',road_access='true',utilities='true',subdivision_verified='true',residential_use='true',geometry_verified='true',legal_access_verified='true',geometry=json.dumps({'type':'Polygon','coordinates':[[[-95,32],[-94.99,32],[-94.99,32.01],[-95,32.01],[-95,32]]]}))
def market():return dict(geoid='48423',name='SYNTHETIC Tyler benchmark fixture',state='TX',lat=32,lon=-95,pop_growth=4,pop_acceleration=1,employment_growth=3,permit_growth=5,price_growth=2,price_acceleration=1,home_value_to_worker_pay=4)
def fixture_records():
 result=[]
 for kind,rows in [('homes',[home(i)for i in range(15)]),('lots',[lot(i)for i in range(5)]),('tracts',[tract()])]:
  records,errors=normalize_records(rows,kind);assert not errors;result.extend(records)
 return result

def test_residual_hits_target_total_cost_return():
 p=SearchProfile(min_profit=0);v=residual(3,100000,p);at_offer=residual(3,100000,p,v['max_acquisition']);assert at_offer['roc']==pytest.approx(.25);assert v['max_acquisition']==pytest.approx(122250)
def test_minimum_profit_tightens_offer():
 p=SearchProfile(min_profit=100000);v=residual(3,100000,p);assert residual(3,100000,p,v['max_acquisition'])['profit']==pytest.approx(100000)
def test_break_even_and_finance():
 p=SearchProfile();v=residual(3,100000,p,75000);assert residual(3,v['break_even_lot'],p,75000)['profit']==pytest.approx(0);assert v['holding']==15000
@pytest.mark.parametrize('lots,price,purchase',[(0,100,0),(1.5,100,0),(2,-100,0),(2,100,-1),(2,float('nan'),0)])
def test_invalid_financial_inputs(lots,price,purchase):
 with pytest.raises(ValueError):residual(lots,price,SearchProfile(),purchase)
def test_acreage_conversion_and_distance():
 assert 1.5*43560==65340;assert haversine(32,-95,32,-95)==0;assert 68<haversine(32,-95,33,-95)<70
def test_closed_sales_not_listings():
 r=home(1);r['status']='active';valid,errors=normalize_records([r],'homes');assert not valid and errors
def test_finished_lot_not_raw_agricultural():
 r=lot(1);r['finished']='false';valid,errors=normalize_records([r],'lots');assert not valid and errors
def test_comp_filters_and_equal_volume_windows():
 records=fixture_records();s=comps(records,market(),SearchProfile(),'homes',ASOF);assert s['count']==15;assert s['volume_growth']==pytest.approx((8/7-1)*100);assert s['median_sqft']==2200;assert s['sufficient'];s=comps(records,market(),SearchProfile(lot_target=3),'homes',ASOF);assert s['count']==0
def test_comp_lookback_and_confidence():
 records=fixture_records();assert comps(records,market(),SearchProfile(lookback_months=6),'homes',ASOF)['count']==8;r=records[0];r['confidence']=.5;assert comps(records,market(),SearchProfile(),'homes',ASOF)['count']==14
def test_duplicate_sources_do_not_inflate_comps():
 a=home(0);b={**a,'source_url':'https://example.test/other'};records,errors=normalize_records([a,b],'homes');assert comps(records,market(),SearchProfile(),'homes',ASOF)['count']==1
 b['sale_price']='999999';records,errors=normalize_records([a,b],'homes');assert comps(records,market(),SearchProfile(),'homes',ASOF)['count']==0
def test_feasibility_unknown_never_passes():
 r=fixture_records()[-1];f=yield_and_checks(r,SearchProfile());assert f['potential_lots']==3 and f['verified'];r['utilities']=None;assert not yield_and_checks(r,SearchProfile())['verified']
def test_road_frontage_and_septic_cap_yield():
 r=fixture_records()[-1];r['frontage_ft']=200;assert yield_and_checks(r,SearchProfile())['potential_lots']==1;r['frontage_ft']=600;r['septic_capacity']=2;assert yield_and_checks(r,SearchProfile())['potential_lots']==2
def test_staged_qualified_deal_and_no_fake_rankings():
 p=SearchProfile(min_pop_growth=3);assert not search([market()],[],p,ASOF)['opportunities'];r=search([market()],fixture_records(),p,ASOF);assert len(r['opportunities'])==1;assert all(v is not None for v in r['opportunities'][0]['scores'].values())
def test_parcel_inventory_is_not_listing():
 rows=fixture_records();rows[-1]['status']='inventory';rows[-1]['property_type']='parcel_inventory';r=search([market()],rows,SearchProfile(),ASOF);assert not r['opportunities'];assert not r['markets'][0]['candidates'][0]['listing']
def test_every_key_search_gate_can_remove_candidate():
 rows=fixture_records();base=SearchProfile()
 for update in [dict(max_price_acre=5000),dict(min_acres=9),dict(max_acres=6),dict(min_profit=200000),dict(target_roc=2),dict(town_miles=1),dict(commute_minutes=10),dict(min_lot_value=200000),dict(min_home_comps=16),dict(min_lot_comps=6),dict(max_dom=10),dict(min_sales_growth=100),dict(exclusions=['TX']),dict(min_pop_growth=10)]:
  result=search([market()],rows,SearchProfile(**{**base.model_dump(),**update}),ASOF);assert not result['opportunities'],update
def test_geographic_exclusions_and_insufficient_data():
 assert search([market()],[],SearchProfile(exclusions=['48423']),ASOF)['eligible_markets']==0
 m=market();m['pop_growth']=None;assert not search([m],[],SearchProfile(),ASOF)['markets']
def test_vintage_backtest_blocks_future_and_late_revisions():
 rows=[dict(period='2020-01-01',available_at='2020-02-01',value=1),dict(period='2020-01-01',available_at='2025-01-01',value=99),dict(period='2022-01-01',available_at='2022-02-01',value=20)]
 assert vintage_backtest(rows,'2020-03-01',lambda r:sum(x['value']for x in r))==1
def test_duckdb_idempotent_import_and_profile(tmp_path):
 db=Store(tmp_path/'test.duckdb');r=fixture_records();db.import_records(r);db.import_records(r);assert len(db.records())==21;db.save_profile('test',SearchProfile().model_dump());assert db.profiles()['test']['min_acres']==5

def setup_provider(tmp_path,monkeypatch,response):
 for key,val in [('RENTCAST_API_KEY','SYNTHETIC_TEST_KEY'),('RENTCAST_ENABLED','true'),('RENTCAST_MONTHLY_BUDGET','1'),('RENTCAST_COST_RESERVATION','.6')]:monkeypatch.setenv(key,val)
 db=Store(tmp_path/'api.duckdb');return RentCast(db,httpx.Client(transport=httpx.MockTransport(response))),db
def test_paid_approval_and_disabled_defaults(tmp_path,monkeypatch):
 p,db=setup_provider(tmp_path,monkeypatch,lambda req:httpx.Response(200,json=[]))
 with pytest.raises(PermissionError):p.call({'mode':'homes'})
 assert db.usage()==[];monkeypatch.setenv('RENTCAST_ENABLED','false')
 with pytest.raises(PermissionError):p.call({'mode':'homes'},True)
def test_paid_cache_dedupe_and_budget_pause(tmp_path,monkeypatch):
 calls=[]
 def response(req):calls.append(req);return httpx.Response(200,json=[])
 p,db=setup_provider(tmp_path,monkeypatch,response);q={'mode':'homes','latitude':32};p.call(q,True);p.call(q,True);assert len(calls)==1;assert db.usage()[0]['requests']==1
 with pytest.raises(PermissionError):p.call({**q,'latitude':33},True)
def test_api_failure_is_visible_and_reserved(tmp_path,monkeypatch):
 p,db=setup_provider(tmp_path,monkeypatch,lambda req:httpx.Response(500,json={'error':'fixture'}));r=p.run([{'mode':'homes'}],1,True);assert r[0]['status']=='error';assert db.usage()[0]['requests']==1;assert db.usage()[0]['reserved_cost']==.6
def test_per_search_limit_stops_calls(tmp_path,monkeypatch):
 p,db=setup_provider(tmp_path,monkeypatch,lambda req:httpx.Response(200,json=[]))
 with pytest.raises(PermissionError):p.run([{'mode':'homes'},{'mode':'lots'}],1,True)
 assert not db.usage()
def test_rentcast_uses_actual_geography_not_radius_target(tmp_path):
 p=RentCast(Store(tmp_path/'geo.duckdb'));r=p.normalize({'id':'test','lotSize':65340,'lastSaleDate':'2026-01-01','lastSalePrice':300000,'countyFips':'48001'},'homes','48423');assert r['geoid']=='48001';assert r['status']=='closed';r=p.normalize({'id':'test','lotSize':65340},'homes','48423');assert r['geoid']is None and r['status']=='record_only'
def test_sonar_requires_dated_citations(tmp_path,monkeypatch):
 for k,v in [('PERPLEXITY_API_KEY','SYNTHETIC_KEY'),('PERPLEXITY_ENABLED','true'),('PERPLEXITY_MONTHLY_BUDGET','1'),('PERPLEXITY_COST_RESERVATION','.1')]:monkeypatch.setenv(k,v)
 p=Perplexity(Store(tmp_path/'sonar.duckdb'),httpx.Client(transport=httpx.MockTransport(lambda req:httpx.Response(200,json={'output':[]}))))
 with pytest.raises(RuntimeError):p.call({'question':'synthetic fixture'},True)
def test_real_public_multiple_states_and_tyler():
 import pathlib
 data=json.loads((pathlib.Path(__file__).parents[2]/'scout-markets.json').read_text());states={m['state']for m in data['markets']};assert len(states)>=50;tyler=next(m for m in data['markets']if m['geoid']=='48423');assert tyler['name'].startswith('Smith');assert tyler['employment_growth']is not None;assert tyler['permits']is not None
 for state in ['TX','NC','CA','OH']:assert any(m['state']==state and m['pop_growth']is not None for m in data['markets'])
 assert any(m['pop_growth']<0 for m in data['markets']);assert not search(data['markets'],[],SearchProfile(),ASOF)['opportunities']


def test_product_segment_trends_require_both_periods():
 from analysis import product_segments
 summary=comps(fixture_records(),market(),SearchProfile(),'homes',ASOF);segments=product_segments(summary,SearchProfile());assert segments[0]['count']==15;assert segments[0]['volume_growth']is not None
 summary=comps(fixture_records(),market(),SearchProfile(lookback_months=6),'homes',ASOF);assert product_segments(summary,SearchProfile())[0]['volume_growth']is None

def test_geometry_invalid_self_intersection_rejected():
 r=tract();r['geometry']=json.dumps({'type':'Polygon','coordinates':[[[0,0],[1,1],[1,0],[0,1],[0,0]]]});valid,errors=normalize_records([r],'tracts');assert not valid and errors

def test_public_source_failures_retain_markets_and_are_reported(tmp_path,monkeypatch):
 import public_data,urllib.error
 root=tmp_path/'scout';root.mkdir();m=market();m['price_period']='2024-12-31';(tmp_path/'scout-markets.json').write_text(json.dumps({'markets':[m]}));monkeypatch.setattr(public_data,'ROOT',root);monkeypatch.setenv('BEA_API_KEY','')
 def offline(req,timeout):raise urllib.error.URLError('SYNTHETIC offline fixture')
 monkeypatch.setattr(public_data.urllib.request,'urlopen',offline);public_data.refresh();result=json.loads((tmp_path/'scout-markets.json').read_text());assert len(result['markets'])==1;assert all(s['status']=='error'for s in result['sources']if s['id']!='bea')
