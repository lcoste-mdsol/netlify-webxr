import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceIntent, parseStartupIndex } from './voiceIntentParser.ts';
import { parseVoiceIntent as parseStandaloneVoiceIntent } from '../../standalone/voiceService.js';

const SAMPLE_STARTUPS = [
  { id: '1', name: 'EEL Energy', category: 'Nature', typeID: 27, commercialDescription: 'Tidal energy' },
  { id: '2', name: 'Gyrolift', category: 'Life', typeID: 172, commercialDescription: 'Mobility chair' },
  { id: '3', name: 'Biomotum', category: 'Life', typeID: 172, commercialDescription: 'Ankle exo' },
  { id: '4', name: 'Endiatx', category: 'Life', typeID: 172, commercialDescription: 'PillBot' },
];

test('Load 3D model phrases map to load_3d_model instead of goto_index 3', () => {
  const phrases = [
    'Load 3D model',
    'Load the 3D model',
    'Show the 3D model',
    'Open 3D',
    'Load virtual twin',
    'View in 3D',
    'Load model',
  ];
  for (const phrase of phrases) {
    assert.equal(parseVoiceIntent(phrase, SAMPLE_STARTUPS).intent, 'load_3d_model', `TS failed for "${phrase}"`);
    assert.equal(parseStandaloneVoiceIntent(phrase, SAMPLE_STARTUPS).intent, 'load_3d_model', `Standalone failed for "${phrase}"`);
  }
});

test('Remove / dismiss 3D model phrases map to dismiss_model instead of load_3d_model', () => {
  const phrases = [
    'Remove the 3D model',
    'remove 3D model',
    'Delete the 3D model',
    'Hide the 3D model',
    'Close the 3D model',
    'Dismiss model',
    'Dismiss the virtual twin',
    'Unload 3D model',
    'Clear model',
  ];
  for (const phrase of phrases) {
    assert.equal(parseVoiceIntent(phrase, SAMPLE_STARTUPS).intent, 'dismiss_model', `TS failed for "${phrase}"`);
    assert.equal(parseStandaloneVoiceIntent(phrase, SAMPLE_STARTUPS).intent, 'dismiss_model', `Standalone failed for "${phrase}"`);
  }
});

test('Startup index selection parses digits and spelled numbers without breaking on 3D', () => {
  assert.deepEqual(parseStartupIndex('Select startup number 4'), 4);
  assert.deepEqual(parseStartupIndex('startup 12'), 12);
  assert.deepEqual(parseStartupIndex('select startup number twenty two'), 22);
  assert.deepEqual(parseStartupIndex('fourth startup'), 4);
  assert.deepEqual(parseStartupIndex('Load 3D model'), null);

  assert.equal(parseVoiceIntent('Select startup number 4', SAMPLE_STARTUPS).gotoIndex, 4);
  assert.equal(parseStandaloneVoiceIntent('Select startup number 4', SAMPLE_STARTUPS).gotoIndex, 4);
});

test('Video and VR/AR commands resolve accurately without collisions', () => {
  assert.equal(parseVoiceIntent('Load video', SAMPLE_STARTUPS).intent, 'load_video');
  assert.equal(parseVoiceIntent('Play the video', SAMPLE_STARTUPS).intent, 'load_video');
  assert.equal(parseVoiceIntent('Close the video', SAMPLE_STARTUPS).intent, 'close_video');
  assert.equal(parseVoiceIntent('Remove the video', SAMPLE_STARTUPS).intent, 'close_video');

  assert.equal(parseStandaloneVoiceIntent('Load video', SAMPLE_STARTUPS).intent, 'load_video');
  assert.equal(parseStandaloneVoiceIntent('Close video', SAMPLE_STARTUPS).intent, 'close_video');
  assert.equal(parseStandaloneVoiceIntent('Stop video', SAMPLE_STARTUPS).intent, 'close_video');

  assert.equal(parseVoiceIntent('Switch to VR', SAMPLE_STARTUPS).intent, 'enter_vr');
  assert.equal(parseVoiceIntent('Enter VR mode', SAMPLE_STARTUPS).intent, 'enter_vr');
  assert.equal(parseVoiceIntent('Switch to AR', SAMPLE_STARTUPS).intent, 'switch_ar');
  assert.equal(parseVoiceIntent('Exit VR', SAMPLE_STARTUPS).intent, 'switch_ar');

  assert.equal(parseStandaloneVoiceIntent('Switch to VR', SAMPLE_STARTUPS).intent, 'enter_vr');
  assert.equal(parseStandaloneVoiceIntent('Switch to AR', SAMPLE_STARTUPS).intent, 'switch_ar');
});

test('Manipulation, detection, filtering, and startup name lookup work cleanly', () => {
  assert.equal(parseVoiceIntent('Recognize this product', SAMPLE_STARTUPS).intent, 'detect_product');
  assert.equal(parseVoiceIntent('Scale up', SAMPLE_STARTUPS).intent, 'scale_up');
  assert.equal(parseVoiceIntent('Scale down', SAMPLE_STARTUPS).intent, 'scale_down');
  assert.equal(parseVoiceIntent('Move up', SAMPLE_STARTUPS).intent, 'move_up');
  assert.equal(parseVoiceIntent('Move down', SAMPLE_STARTUPS).intent, 'move_down');
  assert.equal(parseVoiceIntent('Animate', SAMPLE_STARTUPS).intent, 'toggle_animation');
  assert.equal(parseVoiceIntent('Pause animation', SAMPLE_STARTUPS).intent, 'toggle_animation');
  assert.equal(parseVoiceIntent('Filter by nature', SAMPLE_STARTUPS).category, '27');
  assert.equal(parseVoiceIntent('Filter by product', SAMPLE_STARTUPS).category, '376');
  assert.equal(parseVoiceIntent('Show all projects', SAMPLE_STARTUPS).intent, 'show_all');
  assert.equal(parseVoiceIntent('Tell me about Gyrolift', SAMPLE_STARTUPS).startupName, 'Gyrolift');
  assert.equal(parseVoiceIntent('Help', SAMPLE_STARTUPS).intent, 'help');
});
