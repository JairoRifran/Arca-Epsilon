import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { CombatEmberField } from '../src/systems/CombatEmberField';

/**
 * The ember physics, exercised directly in Node.
 *
 * Everything else about the weapon this session was checked through the browser
 * harness, which renders at about two frames a second and never runs
 * `requestAnimationFrame` at all -- it can count shots but it cannot show what
 * a spark does. The physics does not need a renderer to be wrong, so it does
 * not need one to be tested either. This runs in milliseconds and asserts the
 * behaviour the field actually claims: vacuum and air differ, and the
 * integrator survives the long frames this project really produces.
 */

const readPosition = (field: CombatEmberField, slot: number): THREE.Vector3 => {
  const attribute = field.points.geometry.getAttribute('position') as THREE.BufferAttribute;
  return new THREE.Vector3(attribute.getX(slot), attribute.getY(slot), attribute.getZ(slot));
};

const readColor = (field: CombatEmberField, slot: number): THREE.Vector3 => {
  const attribute = field.points.geometry.getAttribute('color') as THREE.BufferAttribute;
  return new THREE.Vector3(attribute.getX(slot), attribute.getY(slot), attribute.getZ(slot));
};

const FORWARD = new THREE.Vector3(0, 0, -1);
const ORIGIN = new THREE.Vector3(0, 0, 0);

test('in vacuum an ember flies straight and never slows', () => {
  const field = new CombatEmberField(16);
  field.setEnvironment('vacuum');
  field.emit(ORIGIN, FORWARD, 1);

  const start = readPosition(field, 0);
  field.update(0.05);
  const first = readPosition(field, 0);
  const step = first.clone().sub(start);

  // Ten more identical steps must each move the ember by the same vector. Any
  // drag or gravity leaking into the vacuum path shows up here as a step that
  // shrinks or bends.
  for (let index = 0; index < 10; index += 1) {
    const before = readPosition(field, 0);
    field.update(0.05);
    const after = readPosition(field, 0);
    const delta = after.clone().sub(before);
    expect(delta.length(), `step ${index} kept its speed`).toBeCloseTo(step.length(), 5);
    expect(delta.angleTo(step), `step ${index} kept its heading`).toBeCloseTo(0, 5);
  }
});

test('in atmosphere an ember slows down and falls', () => {
  const field = new CombatEmberField(16);
  field.setEnvironment('atmosphere');
  field.emit(ORIGIN, FORWARD, 1);

  const start = readPosition(field, 0);
  field.update(0.05);
  const firstStep = readPosition(field, 0).sub(start).length();

  let previousY = readPosition(field, 0).y;
  let fell = false;
  for (let index = 0; index < 6; index += 1) {
    field.update(0.05);
    const current = readPosition(field, 0);
    if (current.y < previousY) fell = true;
    previousY = current.y;
  }

  const before = readPosition(field, 0);
  field.update(0.05);
  const lateStep = readPosition(field, 0).sub(before).length();

  expect(lateStep, 'drag bled off speed').toBeLessThan(firstStep);
  expect(fell, 'gravity pulled the ember down').toBe(true);
});

test('a long frame damps the ember instead of reversing it', () => {
  // The naive integrator `v -= v * drag * dt` flips sign once `drag * dt`
  // passes 1. Drag here is 4.6, so anything past a 217 ms frame reverses --
  // and this project routinely serves frames far longer than that. The closed
  // form must simply damp hard.
  const field = new CombatEmberField(16);
  field.setEnvironment('atmosphere');
  field.emit(ORIGIN, FORWARD, 1);

  const start = readPosition(field, 0);
  field.update(0.05);
  const heading = readPosition(field, 0).sub(start);

  const before = readPosition(field, 0);
  field.update(0.5);
  const longStep = readPosition(field, 0).sub(before);

  // Gravity legitimately bends the path downward over half a second, so the
  // claim is about the horizontal plane the drag acts on: it must not run
  // backwards along the line of fire.
  const alongFire = longStep.dot(heading.clone().normalize());
  expect(alongFire, 'the ember kept going forward, slowly').toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(longStep.length()), 'the step stayed finite').toBe(true);
});

test('embers cool to black within their life and free their slot', () => {
  const field = new CombatEmberField(16);
  field.setEnvironment('vacuum');
  field.emit(ORIGIN, FORWARD, 1, undefined, 7.4, 0.5);

  const born = readColor(field, 0);
  expect(born.length(), 'a new ember is hot').toBeGreaterThan(0.5);
  expect(field.getDiagnostics().alive).toBe(1);

  // Longest possible life for the given `life` argument is life * 1.35.
  for (let index = 0; index < 40; index += 1) field.update(0.05);

  expect(readColor(field, 0).length(), 'a dead ember is black').toBeCloseTo(0, 3);
  expect(field.getDiagnostics().alive, 'the slot was released').toBe(0);
});

test('a burst past capacity overwrites its oldest sparks, it does not grow', () => {
  const field = new CombatEmberField(8);
  field.setEnvironment('vacuum');
  for (let shot = 0; shot < 10; shot += 1) field.emit(ORIGIN, FORWARD, 6);

  const diagnostics = field.getDiagnostics();
  expect(diagnostics.spawned, 'every requested ember was accounted for').toBe(60);
  expect(diagnostics.alive, 'never more alive than the buffer holds').toBeLessThanOrEqual(8);
  expect(diagnostics.overwritten, 'the ring wrapped rather than allocating').toBeGreaterThan(0);
  expect(
    (field.points.geometry.getAttribute('position') as THREE.BufferAttribute).count,
    'the buffer never resized'
  ).toBe(8);
});

test('sparks inherit the shooter velocity so they trail a moving ship', () => {
  const still = new CombatEmberField(16);
  const moving = new CombatEmberField(16);
  still.setEnvironment('vacuum');
  moving.setEnvironment('vacuum');

  const shipVelocity = new THREE.Vector3(0, 0, -120);
  still.emit(ORIGIN, FORWARD, 1);
  moving.emit(ORIGIN, FORWARD, 1, shipVelocity);

  for (let index = 0; index < 4; index += 1) {
    still.update(0.05);
    moving.update(0.05);
  }

  const carried = readPosition(moving, 0).z;
  const stationary = readPosition(still, 0).z;
  expect(carried, 'the ember carried the ship momentum downrange')
    .toBeLessThan(stationary - 20);
});

test('clearing the field puts every ember out', () => {
  const field = new CombatEmberField(16);
  field.emit(ORIGIN, FORWARD, 6);
  expect(field.getDiagnostics().alive).toBeGreaterThan(0);

  field.clear();
  expect(field.getDiagnostics().alive).toBe(0);
  expect(field.points.geometry.drawRange.count, 'nothing is drawn after a clear').toBe(0);
});
