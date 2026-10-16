from pydantic import BaseModel, Field, ConfigDict, model_validator
class SearchProfile(BaseModel):
 model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
 min_acres:float=Field(5,ge=.1,le=1000);max_acres:float=Field(10,ge=.1,le=1000)
 lot_target:float=Field(1.5,gt=0);lot_tolerance:float=Field(.5,ge=0)
 max_price_acre:float=Field(15000,ge=0);min_home_comps:int=Field(15,ge=1)
 lookback_months:int=Field(24,ge=1,le=120);target_roc:float=Field(.25,ge=0,le=5)
 min_pop_growth:float=Field(3,ge=-100,le=100);town_miles:float=Field(15,gt=0)
 commute_minutes:float=Field(60,gt=0);min_lot_value:float=Field(35000,ge=0)
 min_lot_comps:int=Field(5,ge=1);max_dom:float=Field(180,ge=0)
 min_sales_growth:float=Field(0,ge=-100);require_frontage:bool=True;require_utilities:bool=True
 min_profit:float=Field(30000,ge=0);cost_per_lot:float=Field(15000,ge=0)
 financing_cost:float=Field(5000,ge=0);fixed_cost:float=Field(20000,ge=0);contingency:float=Field(.15,ge=0,le=1)
 years:float=Field(2,gt=0,le=20);holding_annual:float=Field(5000,ge=0)
 selling_rate:float=Field(.06,ge=0,lt=1);risk_reserve:float=Field(10000,ge=0)
 usable_fraction:float=Field(.75,gt=0,le=1);lot_frontage_ft:float=Field(150,gt=0)
 max_flood_fraction:float=Field(.05,ge=0,le=1);max_slope:float=Field(15,ge=0,le=90)
 exclusions:list[str]=[];confidence:float=Field(.6,ge=0,le=1)
 top_markets:int=Field(30,ge=1,le=100);max_requests:int=Field(10,ge=0,le=100)
 @model_validator(mode='after')
 def coherent(self):
  if self.min_acres>self.max_acres:raise ValueError('Minimum acreage exceeds maximum')
  if self.lot_tolerance>=self.lot_target:raise ValueError('Lot tolerance must be less than target acreage')
  return self
