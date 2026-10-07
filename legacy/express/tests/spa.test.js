const request = require('supertest');
const app = require('../src/app');
const fs = require('fs');
const path = require('path');

describe('SPA routing', () => {
  test('unknown path serves SPA shell (public/index.html)', async () => {
    const res = await request(app).get('/some/random/path');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.text).toMatch(/Sign in to PropCare|Welcome back/);
  });

  test('/data/seed-data.js is not exposed at web root', async () => {
    const res = await request(app).get('/data/seed-data.js');
    expect(res.statusCode).toBe(404);
  });

  describe('Landing page markup contract', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'styles.css'), 'utf8');

    test('required ids exist in HTML', () => {
      const ids = ['loginScreen','loginForm','loginRole','loginEmail','loginPassword','loginError','loginBtn','forgotBtn'];
      ids.forEach(id => expect(html).toMatch(new RegExp(`id\s*=\s*"${id}"`)));
      expect(html).toMatch(/<span class="btn-label">/);
    });

    test('required classes exist in HTML and CSS', () => {
      ['login-screen','login-left','login-right','login-card'].forEach(cls => {
        expect(html).toMatch(new RegExp(`class\s*=\s*"[^"]*${cls}[^"]*"`));
        expect(css).toMatch(new RegExp(`\.${cls}`));
      });
    });

    test('old ids and classes are removed', () => {
      ['signin-form','demo-account','form-message','forgot-password','login-shell'].forEach(old => {
        expect(html).not.toMatch(new RegExp(old));
      });
    });

    test('no duplicate ids in HTML', () => {
      const ids = html.match(/id\s*=\s*"([^"]+)"/g) || [];
      const cleaned = ids.map(s => s.match(/"([^"]+)"/)[1]);
      const dup = cleaned.filter((v,i,a) => a.indexOf(v)!==i);
      expect(dup.length).toBe(0);
    });
  });
});
