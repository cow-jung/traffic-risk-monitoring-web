/* 독립된 세 페이지에서 사용하는 메뉴와 도움말 위젯 */
(function () {
  'use strict';
  var current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('header nav a').forEach(function (link) {
    if (link.getAttribute('href') === current) link.classList.add('active');
  });

  var themeButton = document.getElementById('theme-toggle');
  function setTheme(theme) {
    var light = theme === 'light';
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    if (themeButton) {
      themeButton.setAttribute('aria-label', light ? '다크 모드로 전환' : '밝은 모드로 전환');
      themeButton.setAttribute('title', light ? '다크 모드로 전환' : '밝은 모드로 전환');
      themeButton.setAttribute('aria-pressed', String(light));
      themeButton.textContent = light ? '☾' : '☀';
    }
  }
  var savedTheme;
  try { savedTheme = localStorage.getItem('mini-project-theme'); } catch (error) { savedTheme = null; }
  setTheme(savedTheme === 'light' ? 'light' : 'dark');
  if (themeButton) themeButton.addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try { localStorage.setItem('mini-project-theme', next); } catch (error) { /* 저장이 불가능하면 현재 페이지에서만 적용 */ }
  });

  var button = document.getElementById('chat-fab');
  var panel = document.getElementById('chat-panel');
  if (!button || !panel) return;
  panel.innerHTML = '<div class="chat-header"><span>도움말 챗봇<span class="sub">자주 묻는 질문</span></span><button type="button" class="btn-ghost btn-small" id="chat-close" aria-label="닫기">×</button></div><div class="chat-body" id="chat-body"><div class="chat-msg bot">궁금한 항목을 선택해 주세요.</div></div><div class="chat-quick" id="chat-quick"></div>';
  var questions = [
    ['현재 탐지 결과는 실제인가요?', '현재 대시보드의 탐지 기록은 기능 확인을 위한 예시입니다. 실제 모델 결과는 연동 후 표시됩니다.'],
    ['낙하물은 무엇을 구분하나요?', '목재(wood), 상자(box), 페트병(pet) 세 종류를 대상으로 합니다.'],
    ['영상은 어떻게 확인하나요?', '낙하물 탭에서 영상 링크를 입력하거나 사진·영상 파일을 선택할 수 있습니다. 업로드 파일은 현재 브라우저에서만 열립니다.']
  ];
  questions.forEach(function (pair) {
    var item = document.createElement('button');
    item.type = 'button';
    item.textContent = pair[0];
    item.addEventListener('click', function () {
      var user = document.createElement('div');
      var answer = document.createElement('div');
      user.className = 'chat-msg user';
      answer.className = 'chat-msg bot';
      user.textContent = pair[0];
      answer.textContent = pair[1];
      panel.querySelector('#chat-body').append(user, answer);
    });
    panel.querySelector('#chat-quick').append(item);
  });
  function toggle(open) {
    panel.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
  }
  button.addEventListener('click', function () { toggle(!panel.classList.contains('open')); });
  panel.querySelector('#chat-close').addEventListener('click', function () { toggle(false); });
})();
