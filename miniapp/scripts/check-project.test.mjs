import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkProject } from './check-project.mjs';

const config = `export default defineAppConfig({tabBar:{list:[{pagePath:'pages/home/index',iconPath:'./static/home.png'}]}})`;
const check = (source, app = config) => checkProject({ 'src/app.config.ts': app, 'src/page.tsx': source });

test('allows detail navigation, including template queries', () => {
  assert.equal(check('Taro.navigateTo({url:`/pages/detail/index?id=${id}`})').errors.length, 0);
});
test('rejects tab navigation and imported aliases', () => {
  assert.equal(check("Taro.navigateTo({url:'/pages/home/index?x=1'})").errors.length, 1);
  assert.equal(check("import {navigateTo as go} from '@tarojs/taro'; go({url:'/pages/home/index'})").errors.length, 1);
});
test('does not silently certify dynamic destinations', () => {
  assert.equal(check('Taro.navigateTo({url: destination})').warnings.length, 1);
});
test('rejects absolute and unprefixed icon paths', () => {
  for (const icon of ['/static/home.png', 'static/home.png']) {
    assert.equal(check('', config.replace('./static/home.png', icon)).errors.length, 1);
  }
});
test('allows normal AuthProvider and catches nested/self-closing guards', () => {
  assert.equal(check('const app = <AuthProvider>{children}</AuthProvider>').errors.length, 0);
  assert.equal(check('const app = <AuthProvider><div><RouteGuard /></div></AuthProvider>').errors.length, 1);
});
test('does not skip malformed or missing config', () => {
  assert.ok(checkProject({}).errors.length);
  assert.ok(check('', 'export default {').errors.length);
});
