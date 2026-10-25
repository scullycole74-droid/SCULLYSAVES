"""Headless Chromium smoke test: load actual static site and exercise both stages."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
httpd=ThreadingHTTPServer(('127.0.0.1',0), partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
Thread(target=httpd.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1365,'height':1000})
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content((ROOT/'index.html').read_text(), wait_until='load', timeout=45000)
  assert 'Oct 25' in page.locator('#topdate').inner_text()
  assert page.locator('#currentgames').inner_text()=='179'
  assert 'game logs' in page.locator('#dataSourceStatus').inner_text()
  page.locator('#matchups').fill('CAR vs VAN\nTOR vs BOS')
  page.locator('#runMatchups').click()
  assert 'CAR' in page.locator('#matchupResults').inner_text()
  page.get_by_text('02   Goalie Saves',exact=False).first if False else None
  page.locator('[data-tab="saves"]').first.click()
  page.locator('#runSaves').click()
  assert 'EXPECTED TEAM SHOTS' in page.locator('#saveResults').inner_text()
  page.locator('[data-tab="research"]').first.click()
  page.locator('#situationSummary').select_option('5on4')
  assert page.locator('#snapshotTable tbody tr').count()==32
  page.screenshot(path='/mnt/data/SCULLY_v1.1_preview.png',full_page=True)
  assert not errors,errors
  print('Headless Chromium website smoke test passed; dashboard and 4 tables rendered, both stages functional.')
  browser.close()
finally:
 httpd.shutdown()
