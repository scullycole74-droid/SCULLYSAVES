"""Headless localhost checks for new four-tab UI and Stage 2 handoff; mocked data never written."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
sample={
 'schema':1,'season':'2026-27','slates':{'2026-10-25':{'date':'2026-10-25','gameIds':['2026029999']}},
 'records':{'2026029999|CAR':{'recordId':'2026029999|CAR','gameId':'2026029999','gameDate':'2026-10-25','home':'CAR','away':'VAN','attack':'CAR','defense':'VAN','startTimeUTC':'2026-10-25T23:00:00Z','classif':'GREEN','scenario':'S03','shotStatus':'FINAL','projectedShots':34.1,'actualShots':36},
           '2026029999|VAN':{'recordId':'2026029999|VAN','gameId':'2026029999','gameDate':'2026-10-25','home':'CAR','away':'VAN','attack':'VAN','defense':'CAR','startTimeUTC':'2026-10-25T23:00:00Z','classif':'RED','scenario':'S01','shotStatus':'FINAL','projectedShots':26.2,'actualShots':23}},'missed':{}}
httpd=ThreadingHTTPServer(('127.0.0.1',0), partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
Thread(target=httpd.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1350,'height':940})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  # Force displayed Toronto date for predictable test, independent of actual run time.
  page.set_content((ROOT/'index.html').read_text(),wait_until='load',timeout=60000)
  page.evaluate("sample=>{torontoSlateDate=()=> '2026-10-25';TRACKING=sample;showAutoSlate();renderTracking();}",sample)
  assert page.locator('.tab').count()==4
  assert page.locator('[data-tab="matchups"]').count()==1
  page.evaluate('showAutoSlate();renderTracking()')
  assert 'GREEN' in page.locator('#autoSlate').inner_text()
  assert 'RED' in page.locator('#autoSlate').inner_text()
  page.locator('[data-auto-id="2026029999|CAR"]').click()
  assert page.locator('#pane-saves').evaluate("e=>e.classList.contains('active')")
  assert page.locator('#attack').input_value()=='CAR'
  assert page.locator('#defense').input_value()=='VAN'
  assert page.locator('#homeTeam').input_value()=='CAR'
  page.locator('#runSaves').click()
  assert 'Venue impact' in page.locator('#saveResults').inner_text()
  page.locator('[data-tab="tracker"]').click()
  assert 'SCULLY Performance Tracker' in page.locator('#pane-tracker').inner_text()
  assert '36' in page.locator('#trackerResults').inner_text()
  assert '100.0%' in page.locator('#trackerKpis').inner_text()
  assert page.locator('#trackerChart svg').count()==1
  page.locator('#trackerColor').select_option('RED')
  assert 'RED' in page.locator('#trackerResults').inner_text()
  page.locator('#trackingDate').fill('2026-10-25')
  assert page.locator('#trackerResults tbody tr').count()==2
  page.locator('[data-tab="research"]').click()
  assert page.locator('#snapshotTable tbody tr').count()==32
  page.locator('[data-tab="matchups"]').click()
  page.locator('#matchups').fill('CAR vs VAN')
  page.locator('#runMatchups').click()
  assert 'CAR' in page.locator('#matchupResults').inner_text()
  assert not errors, errors
  print('Four-tab real-browser tests passed (mock audit data only, never saved): green/red slate, Stage2 handoff/venue, history stats/chart, date filter, research tables, manual Stage1.')
  browser.close()
finally:
 httpd.shutdown()
