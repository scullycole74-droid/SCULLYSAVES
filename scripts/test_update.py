"""Offline validation against the original archived SCULLY data."""
import csv, json, subprocess, sys, tempfile, importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=json.loads((ROOT/'data/current-season.json').read_text())
SUMMARY=json.loads((ROOT/'data/oct25-team-summaries.json').read_text())
assert len(BASE['current'])==1510
assert len(SUMMARY['situations'])==4
for rows in SUMMARY['situations'].values():
    assert len(rows)==32
    assert sum(v['games'] for v in rows.values())//2==179
assert sum(x['shotsOnGoalFor'] for x in SUMMARY['situations']['all'].values())==9799
with tempfile.TemporaryDirectory() as d:
    fixture=Path(d)/'fixture.csv'
    output=Path(d)/'generated.json'
    with fixture.open('w',newline='') as f:
        wr=csv.writer(f)
        wr.writerow([*BASE['columns'],'playoffGame'])
        for row in BASE['current']:wr.writerow([*row,0])
    p=subprocess.run([sys.executable,str(ROOT/'scripts/update_moneypuck.py'),
                      '--input-csv',str(fixture),'--output',str(output)],capture_output=True,text=True)
    assert p.returncode==0, p.stderr
    new=json.loads(output.read_text())
    assert new['metadata']['games']==151
    assert new['metadata']['lastGameDate']=='20261020'
    assert len(new['current'])==1510
    assert new['columns']==BASE['columns']
print('SCULLY source-schema, 5-situation game-log and 4-situation Oct 25 snapshot tests passed.')

# The same 2026–27 season continues into January–April 2027; the daily job must not
# stop when the calendar year changes. This is a validation fixture, not NHL data.
spec=importlib.util.spec_from_file_location('scully_moneypuck',ROOT/'scripts/update_moneypuck.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
advanced=[r.copy() for r in BASE['current']]
ki={k:i for i,k in enumerate(BASE['columns'])}
for row in advanced:
    if row[ki['gameDate']]=='20261020': row[ki['gameDate']]='20270120'
assert module.validate(advanced)['lastGameDate']=='20270120'
print('2027 calendar-year date validation passed.')
