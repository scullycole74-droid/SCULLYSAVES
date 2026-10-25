#!/usr/bin/env python3
"""Daily, noncommercial SCULLY refresh from MoneyPuck's publicly linked all_teams.csv.

Run from a GitHub Actions schedule. No scraped HTML; the canonical CSV is linked on
https://moneypuck.com/data.htm. On failure, exit nonzero and preserve the last good
site dataset. Team aggregates are not substituted for missing game rows.
"""
import argparse
import csv
import datetime as dt
import io
import json
import math
from pathlib import Path
import re
import sys
import urllib.request

SOURCE = 'https://moneypuck.com/moneypuck/playerData/careers/gameByGame/all_teams.csv'
SITUATIONS = {'all', '5on5', '5on4', '4on5', 'other'}
COLUMNS = ['team','season','gameId','gameDate','opposingTeam','home_or_away','situation',
           'shotsOnGoalFor','shotsOnGoalAgainst','shotAttemptsFor','shotAttemptsAgainst',
           'unblockedShotAttemptsFor','unblockedShotAttemptsAgainst',
           'goalsFor','goalsAgainst','xGoalsFor','xGoalsAgainst','iceTime']
NUMERIC = set(COLUMNS[7:])
TEAMS = {'ANA','BOS','BUF','CAR','CBJ','CGY','CHI','COL','DAL','DET','EDM','FLA','LAK',
         'MIN','MTL','NJD','NSH','NYI','NYR','OTT','PHI','PIT','SEA','SJS','STL','TBL',
         'TOR','UTA','VAN','VGK','WPG','WSH'}

def read_from_moneypuck():
    req = urllib.request.Request(SOURCE, headers={
        'User-Agent':'SCULLY-noncommercial-research/1.1 (MoneyPuck CSV download)',
        'Accept':'text/csv'})
    return urllib.request.urlopen(req, timeout=180)

def collect(stream):
    reader = csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig', newline=''))
    if not set(COLUMNS).issubset(reader.fieldnames or []):
        raise ValueError('MoneyPuck game-by-game CSV column schema changed: '+
                         repr(sorted(set(COLUMNS)-set(reader.fieldnames or []))))
    rows = []
    for line in reader:
        if str(line.get('season','')).strip() != '2026': continue
        if not str(line.get('gameId','')).startswith('202602'): continue
        if str(line.get('situation','')) not in SITUATIONS: continue
        # Ignore playoff and non-regular-season games even if the provider changes identifiers.
        playoff = str(line.get('playoffGame','')).strip().lower()
        if playoff not in {'','0','0.0','false'}: continue
        out=[]
        for k in COLUMNS:
            v = str(line.get(k,'')).strip()
            if k in NUMERIC:
                try: v = float(v)
                except (ValueError, TypeError): raise ValueError(f'Non-numeric {k}: {v!r}')
                if not math.isfinite(v) or v<0: raise ValueError(f'Invalid {k}: {v!r}')
            out.append(v)
        rows.append(out)
    return rows

def validate(rows):
    if not rows:raise ValueError('No 2026–27 games in downloaded file')
    ix={k:i for i,k in enumerate(COLUMNS)}
    have=set(); by_game={}; situations={}
    for row in rows:
        team,date,gid,sit=row[ix['team']],row[ix['gameDate']],row[ix['gameId']],row[ix['situation']]
        if team not in TEAMS:raise ValueError('Unrecognized club '+team)
        if not re.fullmatch(r'2026\d{4}|2027\d{4}',date):raise ValueError('Invalid date '+date)
        try: dt.datetime.strptime(date, '%Y%m%d')
        except ValueError as exc: raise ValueError('Invalid calendar date '+date) from exc
        k=(gid,team,sit)
        if k in have:raise ValueError(f'Duplicate game/team/situation {k}')
        have.add(k);situations.setdefault((gid,team),set()).add(sit)
        if sit=='all':by_game.setdefault(gid,[]).append(row)
    if len({row[ix['team']] for row in rows if row[ix['situation']]=='all'})!=32:
        raise ValueError('Dataset must cover all 32 NHL teams')
    for gid,pair in by_game.items():
        if len(pair)!=2 or pair[0][ix['team']]==pair[1][ix['team']]:
            raise ValueError(f'Game {gid} must have two distinct team records')
        a,b=pair
        if a[ix['opposingTeam']]!=b[ix['team']] or b[ix['opposingTeam']]!=a[ix['team']]:
            raise ValueError(f'Opponent mismatch in {gid}')
        if abs(a[ix['shotsOnGoalFor']]-b[ix['shotsOnGoalAgainst']])>0.01 or \
           abs(b[ix['shotsOnGoalFor']]-a[ix['shotsOnGoalAgainst']])>0.01:
            raise ValueError(f'Unreconciled shots in {gid}')
    if len(situations)!=len(by_game)*2 or any(v!=SITUATIONS for v in situations.values()):
        raise ValueError('Missing situation rows; do not publish an incomplete refresh')
    if len(by_game)<151: raise ValueError(f'Only {len(by_game)} games; previous baseline has 151')
    rows.sort(key=lambda r:(r[ix['gameDate']],r[ix['gameId']],r[ix['team']],r[ix['situation']]))
    return {'games':len(by_game),'teamGameRows':2*len(by_game),'lastGameDate':max(r[ix['gameDate']] for r in rows if r[ix['situation']]=='all')}

def run():
    p=argparse.ArgumentParser()
    p.add_argument('--input-csv', type=Path, help='Local fixture for tests (instead of download)')
    p.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1]/'data/current-season.json')
    p.add_argument('--force',action='store_true',help='Allow replacing a newer existing set when testing')
    args=p.parse_args()
    if args.input_csv:
        with args.input_csv.open('rb') as f:rows=collect(f)
    else:
        with read_from_moneypuck() as f:rows=collect(f)
    details=validate(rows)
    if args.output.exists() and not args.force:
        prev=json.loads(args.output.read_text(encoding='utf-8'))
        pmeta=prev.get('metadata',{})
        if details['games']<pmeta.get('games',0):
            raise ValueError('Refresh would decrease number of completed games; retaining previous data')
        if details['lastGameDate']<pmeta.get('lastGameDate',''):
            raise ValueError('Refresh would move game date backwards; retaining previous data')
    out={'metadata':{**details,'season':'2026-27','source':SOURCE,
                     'generatedUTC':dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')},
         'columns':COLUMNS,'current':rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temp=args.output.with_suffix(args.output.suffix+'.tmp')
    temp.write_text(json.dumps(out, separators=(',',':'),ensure_ascii=False)+'\n',encoding='utf-8')
    temp.replace(args.output)
    print(f'Validated {details["games"]} games through {details["lastGameDate"]}; wrote {args.output}')

if __name__=='__main__':
    try:run()
    except Exception as exc:
        print('SCULLY updater failed:',exc,file=sys.stderr)
        sys.exit(1)
