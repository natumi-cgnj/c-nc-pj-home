"""Deliver one C-NC test result without printing the callback credential."""
import json
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CALLBACK_URL = 'https://lbxjshaiffklmalcxiif.supabase.co/functions/v1/claude-result'


def payload(value):
    if value.get('callback_url') != CALLBACK_URL:
        raise ValueError('Unexpected callback destination')
    if not re.fullmatch(r'[0-9a-fA-F-]{36}', str(value.get('run_id', ''))):
        raise ValueError('Invalid run identifier')
    if not re.fullmatch(r'[a-f0-9]{64}', str(value.get('callback_token', ''))):
        raise ValueError('Invalid callback credential')
    result = value.get('result')
    if not isinstance(result, str) or not result.strip() or len(result) > 16000:
        raise ValueError('Invalid result')
    return {key: value[key] for key in ('run_id', 'callback_token', 'result')}


def main():
    try:
        raw = sys.stdin.read(32769)
        if len(raw) > 32768:
            raise ValueError('Input is too large')
        value = payload(json.loads(raw))
        request = Request(CALLBACK_URL, data=json.dumps(value, ensure_ascii=False).encode('utf-8'), headers={'Content-Type': 'application/json'}, method='POST')
        with urlopen(request, timeout=20) as response:
            accepted = json.load(response).get('accepted') is True
        if not accepted:
            raise ValueError('Result was not accepted')
        print('C-NC result delivered.')
        return 0
    except (ValueError, KeyError, TypeError, HTTPError, URLError, TimeoutError):
        print('C-NC result delivery failed. Check this run and its callback expiry.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
