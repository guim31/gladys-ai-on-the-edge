// -----------------------------------------------------------------------------
// The firmware formats: topics, the json of a number, the REST answers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanStatus,
  interpretReading,
  parseInteger,
  parseNumberJson,
  parseRestJson,
  parseTopic,
  shortTimestamp,
  subscriptions,
} from '../src/aote.js';
import { numberJson, restJson } from './helpers/world.js';

test('topics: system fields, named numbers, the default number, the longest main topic', () => {
  const mains = ['watermeter', 'home/meters', 'home/meters/gas'];
  assert.deepEqual(subscriptions(['watermeter']), ['watermeter/#']);
  assert.deepEqual(parseTopic(mains, 'watermeter/connection'), {
    main: 'watermeter',
    kind: 'system',
    field: 'connection',
  });
  assert.deepEqual(parseTopic(mains, 'watermeter/main/json'), {
    main: 'watermeter',
    kind: 'number',
    number: 'main',
  });
  assert.deepEqual(parseTopic(mains, 'watermeter/json'), {
    main: 'watermeter',
    kind: 'number',
    number: 'default',
  });
  assert.deepEqual(parseTopic(mains, 'home/meters/gas/json'), {
    main: 'home/meters/gas',
    kind: 'number',
    number: 'default',
  });
  // Field by field topics, the HA discovery and unknown ones are ignored.
  assert.equal(parseTopic(mains, 'watermeter/main/value'), null);
  assert.equal(parseTopic(mains, 'watermeter/freeMem'), null);
  assert.equal(parseTopic(mains, 'homeassistant/sensor/watermeter/value/config'), null);
  assert.equal(parseTopic(mains, 'watermeterx/json'), null);
});

test('a valid round', () => {
  assert.deepEqual(parseNumberJson(numberJson()), {
    value: 1234.5678,
    rate: 0.00016,
    raw: '01234.5678',
    error: 'none',
    message: '',
    timestamp: '2026-11-10T14:05:02+0100',
  });
});

test('the firmware errors are told apart', () => {
  const neg = parseNumberJson(
    numberJson({
      value: '',
      rate: '',
      error: 'Neg. Rate - Read: 1234.5600 - Raw: 01234.5600 - Pre: 1234.5670 ',
    }),
  );
  assert.equal(neg.error, 'negative');
  assert.equal(neg.value, null);
  const high = parseNumberJson(
    numberJson({
      value: '',
      rate: '',
      error: 'Rate too high - Read: 1334.5678 - Pre: 1234.5670 - Rate: 100.0008',
    }),
  );
  assert.equal(high.error, 'too_high');
  // A digit still "N" without a previous value: no value, no message.
  assert.equal(parseNumberJson(numberJson({ value: '', rate: '', error: '' })).error, 'unreadable');
  assert.equal(interpretReading({ value: '12', error: 'something else' }).error, 'other');
  assert.equal(interpretReading({ value: '12', error: '' }).error, 'none');
  assert.equal(parseNumberJson('not json'), null);
  assert.equal(parseNumberJson('[1]'), null);
});

test('GET /json: every number of the device', () => {
  const numbers = parseRestJson(restJson({ main: {}, gas: { value: '42.123' } }));
  assert.deepEqual([...numbers.keys()], ['main', 'gas']);
  assert.equal(numbers.get('gas').value, 42.123);
  assert.equal(parseRestJson('Flow not (yet) started'), null);
});

test('plain answers: integers, flow status, timestamps', () => {
  assert.equal(parseInteger('-67'), -67);
  assert.equal(parseInteger(' 52\n'), 52);
  assert.equal(parseInteger('WIFI not (yet) connected'), null);
  assert.equal(cleanStatus('Flow finished (14:05:12)'), 'Flow finished');
  assert.equal(cleanStatus('Take Image'), 'Take Image');
  assert.equal(shortTimestamp('2026-11-10T14:05:02+0100'), '2026-11-10 14:05');
  assert.equal(shortTimestamp(''), '');
});
