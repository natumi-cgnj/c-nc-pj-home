import { createMobileClient } from './mobile-config.mjs';
const client = createMobileClient(), button = document.getElementById('login');
const error = document.getElementById('loginError');
const existing = await client.auth.getSession();
if (existing.data.session) location.replace('mobile.html');
document.getElementById('loginForm').onsubmit = async event => {
  event.preventDefault(); if (button.disabled) return;
  button.disabled = true; button.textContent = '正在登录…'; error.textContent = '';
  try {
    const result = await client.auth.signInWithPassword({ email: document.getElementById('email').value.trim(), password: document.getElementById('password').value });
    if (result.error) throw result.error;
    document.getElementById('password').value = ''; location.replace('mobile.html');
  } catch (e) {
    error.textContent = e.message === 'Invalid login credentials' ? '邮箱或密码不正确。' : '暂时没有连上，请稍后重试。';
    button.disabled = false; button.textContent = '登录同步';
  }
};
