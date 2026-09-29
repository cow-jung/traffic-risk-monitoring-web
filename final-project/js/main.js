/* ==========================================================================
   위기탈출 넘버 포 — 공통 스크립트
   실제 백엔드/모델 서버가 없는 정적 사이트이므로, 관제 화면·공지사항·게시판은
   모의(mock) 데이터로 동작을 시연합니다.
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     0. 공통 유틸
     --------------------------------------------------------------------- */
  function pad(n) { return String(n).padStart(2, '0'); }

  function timeStr(date) {
    return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  function showToast(message) {
    var toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    requestAnimationFrame(function () { toast.classList.add('show'); });
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 2400);
  }

  function getRole() {
    return localStorage.getItem('ntf_role') || 'guest';
  }

  /* ---------------------------------------------------------------------
     1. 내비게이션 활성 표시 + 로그인 상태 표시
     --------------------------------------------------------------------- */
  function initNav() {
    var here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('nav a').forEach(function (a) {
      var target = a.getAttribute('href').split('/').pop();
      if (target === here) a.classList.add('active');
    });

    var role = getRole();
    document.body.classList.toggle('role-admin', role === 'admin');

    var loginLink = document.querySelector('nav a[href*="login.html"]');
    if (loginLink && role !== 'guest') {
      loginLink.textContent = role === 'admin' ? '로그인됨 (관리자)' : '로그인됨 (사용자)';
    }
  }

  /* ---------------------------------------------------------------------
     2. 로그인 페이지
     --------------------------------------------------------------------- */
  function initLogin() {
    var form = document.querySelector('#login-form form');
    if (!form) return;

    var userBtn = document.getElementById('role-user');
    var adminBtn = document.getElementById('role-admin');
    var selected = 'user';

    function pick(role) {
      selected = role;
      userBtn.classList.toggle('active', role === 'user');
      adminBtn.classList.toggle('active', role === 'admin');
    }
    userBtn.addEventListener('click', function () { pick('user'); });
    adminBtn.addEventListener('click', function () { pick('admin'); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      localStorage.setItem('ntf_role', selected);
      showToast((selected === 'admin' ? '관리자' : '일반 사용자') + '로 로그인되었습니다.');
      setTimeout(function () { location.href = '../index.html'; }, 700);
    });
  }

  /* ---------------------------------------------------------------------
     3. 챗봇 위젯 (모든 페이지 공통, 로그인 페이지 제외)
     --------------------------------------------------------------------- */
  var FAQ = [
    ['갓길 정차는 어떻게 판단하나요?', '지정된 갓길 영역 안에서 차량이 일정 시간 이상 움직이지 않을 때 정차로 판단해요.'],
    ['보행자 탐지가 왜 어려운가요?', '고속도로 CCTV는 각도가 높고 사람이 화면에 아주 작게 찍혀서, 일반 객체 탐지 모델이 잘 찾아내지 못해요. 지금 가장 크게 개선하려는 부분이에요.'],
    ['어떤 모델을 쓰고 있나요?', 'RetinaNet, YOLO, DINO를 각각 사전학습 상태와 직접 학습한 상태로 비교하고 있어요.'],
    ['이 프로젝트는 누가 만들었나요?', 'AI-X 스마트 교통 및 인프라 유지관리 아카데미의 4인 팀, 4ositive가 진행하고 있어요.']
  ];

  function initChat() {
    var fab = document.getElementById('chat-fab');
    var panel = document.getElementById('chat-panel');
    if (!fab || !panel) return;

    panel.innerHTML =
      '<div class="chat-header"><span>도움말 챗봇<span class="sub">자주 묻는 질문에 답해드려요</span></span>' +
      '<button type="button" class="btn-ghost btn-small" id="chat-close" aria-label="닫기">×</button></div>' +
      '<div class="chat-body" id="chat-body">' +
      '<div class="chat-msg bot">안녕하세요! 위기탈출 넘버 포에 대해 궁금한 점을 아래에서 골라보세요.</div>' +
      '</div>' +
      '<div class="chat-quick" id="chat-quick"></div>';

    var body = panel.querySelector('#chat-body');
    var quick = panel.querySelector('#chat-quick');

    FAQ.forEach(function (pair) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = pair[0];
      btn.addEventListener('click', function () {
        var u = document.createElement('div');
        u.className = 'chat-msg user';
        u.textContent = pair[0];
        body.appendChild(u);
        var b = document.createElement('div');
        b.className = 'chat-msg bot';
        b.textContent = pair[1];
        body.appendChild(b);
        body.scrollTop = body.scrollHeight;
      });
      quick.appendChild(btn);
    });

    function toggle(open) {
      var isOpen = open !== undefined ? open : !panel.classList.contains('open');
      panel.classList.toggle('open', isOpen);
      fab.setAttribute('aria-expanded', String(isOpen));
    }

    fab.addEventListener('click', function () { toggle(); });
    panel.querySelector('#chat-close').addEventListener('click', function () { toggle(false); });
  }

  /* ---------------------------------------------------------------------
     4. 관제 화면 (control.html) — 모의 실시간 탐지
     --------------------------------------------------------------------- */
  var TYPE_INFO = {
    stop: { label: '갓길 정차', badge: 'badge-stop' },
    person: { label: '보행자 출현', badge: 'badge-person' },
    clear: { label: '정상 주행', badge: 'badge-clear' }
  };

  function initControl() {
    var tableBody = document.getElementById('detection-table-body');
    var alertList = document.getElementById('alert-list');
    var logList = document.getElementById('log-list');
    var canvas = document.getElementById('detection-overlay');
    var dot = document.getElementById('feed-dot');
    var statusText = document.getElementById('feed-status-text');
    if (!tableBody || !canvas) return;

    var ctx = canvas.getContext('2d');
    var detections = [];
    var lastBoxes = [];

    function resizeCanvas() {
      var rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function seedDetection(type, secondsAgo) {
      return {
        type: type,
        time: new Date(Date.now() - secondsAgo * 1000),
        confidence: 0.7 + Math.random() * 0.29
      };
    }

    // 초기 로그: 최근 몇 건을 미리 채워둠
    detections = [
      seedDetection('clear', 210),
      seedDetection('stop', 165),
      seedDetection('clear', 130),
      seedDetection('person', 92),
      seedDetection('clear', 48),
      seedDetection('stop', 12)
    ];

    function renderTable() {
      var rows = detections.slice(-5).reverse().map(function (d) {
        var info = TYPE_INFO[d.type];
        return '<tr><td class="mono">' + timeStr(d.time) + '</td>' +
          '<td><span class="badge ' + info.badge + '">' + info.label + '</span></td>' +
          '<td class="mono">' + Math.round(d.confidence * 100) + '%</td></tr>';
      });
      tableBody.innerHTML = rows.join('');
    }

    function renderAlerts() {
      var alerts = detections.filter(function (d) { return d.type !== 'clear'; }).slice(-4).reverse();
      if (!alerts.length) {
        alertList.innerHTML = '<li class="empty">아직 감지된 이상상황이 없습니다.</li>';
        return;
      }
      alertList.innerHTML = alerts.map(function (d) {
        var info = TYPE_INFO[d.type];
        var levelClass = d.type === 'person' ? 'level-danger' : '';
        return '<li class="' + levelClass + '"><span><span class="badge ' + info.badge + '">' + info.label + '</span> CAM-01 · 상행선 3km 지점</span><span class="alert-time">' + timeStr(d.time) + '</span></li>';
      }).join('');
    }

    function renderLog() {
      logList.innerHTML = detections.slice().reverse().map(function (d) {
        var info = TYPE_INFO[d.type];
        return '<li><span class="t">' + timeStr(d.time) + '</span><span>' + info.label + ' · 신뢰도 ' + Math.round(d.confidence * 100) + '%</span></li>';
      }).join('');
    }

    function drawBoxes() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      lastBoxes.forEach(function (box) {
        var color = box.type === 'person' ? '#ff5468' : box.type === 'stop' ? '#ffb020' : '#35d28a';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        ctx.fillStyle = color;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillText(TYPE_INFO[box.type].label, box.x + 4, box.y - 6 < 10 ? box.y + 14 : box.y - 6);
      });
    }

    function randomBox(type) {
      var w = canvas.width, h = canvas.height;
      var bw = type === 'person' ? w * 0.05 : w * 0.14;
      var bh = type === 'person' ? h * 0.14 : h * 0.16;
      return {
        type: type,
        x: 20 + Math.random() * Math.max(1, w - bw - 40),
        y: 20 + Math.random() * Math.max(1, h - bh - 40),
        w: bw, h: bh
      };
    }

    function tick() {
      var roll = Math.random();
      var type = roll < 0.55 ? 'clear' : roll < 0.8 ? 'stop' : 'person';
      var d = seedDetection(type, 0);
      detections.push(d);
      if (detections.length > 40) detections.shift();

      if (type === 'clear') {
        lastBoxes = Math.random() < 0.5 ? [randomBox('clear')] : [];
        dot.classList.remove('rec');
        statusText.textContent = '영상 분석 중';
      } else {
        lastBoxes = [randomBox(type)];
        dot.classList.add('rec');
        statusText.textContent = TYPE_INFO[type].label + ' 감지됨';
        setTimeout(function () { dot.classList.remove('rec'); statusText.textContent = '영상 분석 중'; }, 2500);
      }

      renderTable();
      renderAlerts();
      renderLog();
      drawBoxes();
    }

    renderTable();
    renderAlerts();
    renderLog();
    setTimeout(function () { statusText.textContent = '영상 분석 중'; }, 900);
    setInterval(tick, 4000);

    var reportBtn = document.getElementById('report-btn');
    if (reportBtn) {
      reportBtn.addEventListener('click', function () {
        showToast('관제센터에 신고가 접수되었습니다.');
      });
    }

    // 모델 비교 탭
    var tabs = document.querySelectorAll('#model-compare .tab-btn');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        document.querySelectorAll('#model-compare .model-panel').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        document.getElementById(tab.dataset.target).classList.add('active');
      });
    });
  }

  /* ---------------------------------------------------------------------
     5. 공지사항 (notice.html)
     --------------------------------------------------------------------- */
  function initNotice() {
    var tableBody = document.getElementById('notice-table-body');
    if (!tableBody) return;

    var notices = [
      { id: 4, title: '1차 중간 점검 회의 안내', date: '09.10', content: '9월 12일 오후 7시, 온라인으로 1차 중간 점검 회의를 진행합니다.\n각자 진행 상황과 막힌 부분을 3줄 이내로 정리해서 오시면 좋겠습니다.' },
      { id: 3, title: '라벨링 가이드라인 v1.1 업데이트', date: '09.06', content: '정상 주행 상황도 함께 라벨링하기로 한 내용을 반영했습니다.\n갓길 영역 기준과 보행자 바운딩 박스 그리는 기준이 조금 더 명확해졌으니 확인 부탁드려요.' },
      { id: 2, title: '라즈베리파이 카메라 설치 일정 공지', date: '09.02', content: '이번 주 토요일 오전, 실제 도로변에서 촬영을 진행할 예정입니다.\n촬영 전 카메라 각도와 배터리 상태를 미리 점검해주세요.' },
      { id: 1, title: '팀 노션 · 트렐로 계정 안내', date: '08.28', content: '실험 결과는 노션에, 할 일은 트렐로 보드에 정리하기로 했습니다.\n초대 링크는 단체 채팅방에 공유되어 있어요.' }
    ];

    function renderList() {
      tableBody.innerHTML = notices.map(function (n) {
        return '<tr class="clickable" data-id="' + n.id + '"><td class="mono">' + n.id + '</td><td>' + n.title + '</td><td class="mono">' + n.date + '</td></tr>';
      }).join('');
      tableBody.querySelectorAll('tr').forEach(function (row) {
        row.addEventListener('click', function () { openNotice(Number(row.dataset.id)); });
      });
    }

    var detail = document.getElementById('notice-detail');
    var titleEl = document.getElementById('notice-detail-title');
    var metaEl = document.getElementById('notice-detail-meta');
    var contentEl = document.getElementById('notice-detail-content');

    function openNotice(id) {
      var n = notices.find(function (x) { return x.id === id; });
      if (!n) { detail.classList.remove('open'); return; }
      titleEl.textContent = n.title;
      metaEl.textContent = '작성일 ' + n.date + ' · 4ositive 운영진';
      contentEl.textContent = n.content;
      detail.dataset.id = n.id;
      detail.classList.add('open');
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    renderList();

    var writeBtn = document.getElementById('notice-write-btn');
    if (writeBtn) writeBtn.addEventListener('click', function () { showToast('새 공지 작성 화면은 준비 중입니다.'); });

    var editBtn = document.getElementById('notice-edit-btn');
    if (editBtn) editBtn.addEventListener('click', function () { showToast('공지 수정 화면은 준비 중입니다.'); });

    var deleteBtn = document.getElementById('notice-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        var id = Number(detail.dataset.id);
        notices = notices.filter(function (n) { return n.id !== id; });
        detail.classList.remove('open');
        renderList();
        showToast('공지가 삭제되었습니다.');
      });
    }
  }

  /* ---------------------------------------------------------------------
     6. 게시판 (board.html)
     --------------------------------------------------------------------- */
  function initBoard() {
    var tableBody = document.getElementById('board-table-body');
    if (!tableBody) return;

    var posts = [
      { id: 3, title: '보행자 탐지 recall이 너무 낮은데 다들 어떠세요', author: '정고은', date: '09.09', content: 'RetinaNet 사전학습 모델로 돌려보니 사람 F1이 거의 0에 가깝게 나와요.\n프레임을 crop해서 사람 영역만 확대해서 다시 넣어보는 것도 시도해볼까 하는데 의견 부탁드려요.', comments: [{ who: '양소정', text: '저도 같은 문제 겪고 있어요. ROI 먼저 잡고 그 안에서만 탐지하는 것도 방법일 것 같아요.' }] },
      { id: 2, title: 'ROI 좌표 잡는 기준 공유합니다', author: '양소정', date: '09.07', content: 'roi_picker.py로 갓길 영역이랑 주행 방향을 마우스로 찍어서 roi_config.json에 저장하도록 해뒀어요.\n각자 촬영한 영상마다 새로 잡아야 하니 참고해주세요.', comments: [] },
      { id: 1, title: '이번 주 촬영 장소 후보 정리했어요', author: '이재준', date: '09.05', content: '갓길 폭이 넓고 사람 통행이 적은 구간 위주로 3곳 추려봤습니다.\n안전을 위해 촬영은 항상 2인 1조로 진행해요.', comments: [] }
    ];

    function renderList() {
      tableBody.innerHTML = posts.map(function (p) {
        return '<tr class="clickable" data-id="' + p.id + '"><td class="mono">' + p.id + '</td><td>' + p.title + '</td><td>' + p.author + '</td><td class="mono">' + p.date + '</td></tr>';
      }).join('');
      tableBody.querySelectorAll('tr').forEach(function (row) {
        row.addEventListener('click', function () { openPost(Number(row.dataset.id)); });
      });
    }

    var detail = document.getElementById('board-detail');
    var titleEl = document.getElementById('board-detail-title');
    var metaEl = document.getElementById('board-detail-meta');
    var contentEl = document.getElementById('board-detail-content');
    var commentList = document.getElementById('comment-list');
    var commentForm = document.getElementById('comment-form');

    function renderComments(post) {
      if (!post.comments.length) {
        commentList.innerHTML = '<li>아직 댓글이 없습니다.</li>';
        return;
      }
      commentList.innerHTML = post.comments.map(function (c) {
        return '<li><span class="who">' + c.who + '</span>' + c.text + '</li>';
      }).join('');
    }

    function openPost(id) {
      var p = posts.find(function (x) { return x.id === id; });
      if (!p) { detail.classList.remove('open'); return; }
      titleEl.textContent = p.title;
      metaEl.textContent = p.author + ' · ' + p.date;
      contentEl.textContent = p.content;
      detail.dataset.id = p.id;
      renderComments(p);
      detail.classList.add('open');
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    renderList();

    var writeBtn = document.getElementById('board-write-btn');
    if (writeBtn) writeBtn.addEventListener('click', function () { showToast('새 글 작성 화면은 준비 중입니다.'); });

    var editBtn = document.getElementById('board-edit-btn');
    if (editBtn) editBtn.addEventListener('click', function () { showToast('글 수정 화면은 준비 중입니다.'); });

    var deleteBtn = document.getElementById('board-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        var id = Number(detail.dataset.id);
        posts = posts.filter(function (p) { return p.id !== id; });
        detail.classList.remove('open');
        renderList();
        showToast('글이 삭제되었습니다.');
      });
    }

    if (commentForm) {
      commentForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = commentForm.querySelector('input');
        var text = input.value.trim();
        if (!text) return;
        var id = Number(detail.dataset.id);
        var p = posts.find(function (x) { return x.id === id; });
        if (!p) return;
        p.comments.push({ who: getRole() === 'admin' ? '관리자' : '사용자', text: text });
        renderComments(p);
        input.value = '';
      });
    }
  }

  /* ---------------------------------------------------------------------
     초기화
     --------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    initNav();
    initChat();
    initLogin();
    initControl();
    initNotice();
    initBoard();
  });
})();