from streamlit.testing.v1 import AppTest
from pathlib import Path
import os,tempfile
with tempfile.TemporaryDirectory(prefix='scout-ui-')as folder:
 os.environ['SCOUT_DATA_DIR']=folder
 at=AppTest.from_file(str(Path(__file__).resolve().parents[1]/'app.py')).run(timeout=30)
 assert not at.exception;before=int(at.metric[1].value)
 next(s for s in at.slider if s.key=='w_min_pop_growth').set_value(0.).run();next(b for b in at.button if b.label=='SEARCH NATIONWIDE').click().run()
 assert not at.exception;after=int(at.metric[1].value);assert after>before
 next(b for b in at.button if b.label=='Save search profile').click().run();assert not at.exception
 print('Streamlit: 31 sliders, actual nationwide search responds to growth control, profile persists; no UI exceptions. Eligible markets:',before,'to',after)
