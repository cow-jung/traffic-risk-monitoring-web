(function () {
  'use strict';
  var allEvents = [], filtered = [], page = 1, pageSize = 30;
  var $ = function (id) { return document.getElementById(id); };

  function text(v) { return v == null || v === '' ? '—' : String(v); }
  function dateTime(e) {
    if (e.timestamp) {
      var d = new Date(String(e.timestamp).replace(' ', 'T'));
      if (!Number.isNaN(d.getTime())) return d.toLocaleString('ko-KR', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
    }
    return text(e.time);
  }
  function eventDate(e) { return e.timestamp ? String(e.timestamp).slice(0, 10) : ''; }
  function camLabel(v) { return String(v).toLowerCase() === 'cam1' ? 'CAM 01' : String(v).toLowerCase() === 'cam2' ? 'CAM 02' : text(v); }
  function confidence(e) { return typeof e.confidence === 'number' ? Math.round(e.confidence * 100) + '%' : '—'; }
  function mediaUrl(url) {
    if (!url) return null;
    try {
      var parsed = new URL(String(url), location.origin);
      return parsed.pathname.indexOf('/event_media/') === 0 ? parsed.pathname + parsed.search : String(url);
    } catch (error) { return String(url); }
  }
  function sortEvents(list) {
    return list.sort(function (a,b) {
      var av = a.timestamp ? Date.parse(String(a.timestamp).replace(' ','T')) : 0;
      var bv = b.timestamp ? Date.parse(String(b.timestamp).replace(' ','T')) : 0;
      return bv-av;
    });
  }
  function applyFilters() {
    var from=$('date-from').value, to=$('date-to').value, cam=$('history-camera').value, type=$('history-type').value;
    var q=$('history-keyword').value.trim().toLowerCase();
    filtered=allEvents.filter(function(e){
      var d=eventDate(e), ecam=String(e.cam_id||'').toLowerCase(), etype=String(e.type||'');
      var hay=[e.message,e.type,e.cam_id,camLabel(e.cam_id),e.event_id].join(' ').toLowerCase();
      return (!from||!d||d>=from)&&(!to||!d||d<=to)&&(cam==='all'||ecam===cam)&&(type==='all'||etype.indexOf(type)>=0)&&(!q||hay.indexOf(q)>=0);
    });
    page=1; render();
  }
  function render() {
    var totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
    if(page>totalPages) page=totalPages;
    var start=(page-1)*pageSize, rows=filtered.slice(start,start+pageSize);
    var body=$('history-body'); body.replaceChildren();
    if(!rows.length){var tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='조건에 맞는 탐지 기록이 없습니다.';tr.append(td);body.append(tr);}
    rows.forEach(function(e){
      var tr=document.createElement('tr');
      [dateTime(e),camLabel(e.cam_id),text(e.type),confidence(e),text(e.message)].forEach(function(v){var td=document.createElement('td');td.textContent=v;tr.append(td);});
      var media=document.createElement('td');
      var image=mediaUrl(e.image_url), video=mediaUrl(e.video_url);
      if(image){var a=document.createElement('a');a.href=image;a.target='_blank';a.rel='noopener';a.textContent='이미지';media.append(a);}
      if(video){if(image)media.append(' · ');var v=document.createElement('a');v.href=video;v.target='_blank';v.rel='noopener';v.textContent='영상';media.append(v);}
      if(!image&&!video)media.textContent='—';
      tr.append(media);body.append(tr);
    });
    $('history-count').textContent='검색 결과 '+filtered.length+'건';
    $('page-info').textContent=page+' / '+totalPages;
    $('prev-page').disabled=page<=1; $('next-page').disabled=page>=totalPages;
  }
  function csvCell(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}
  function downloadCsv(){
    var rows=[['발생 일시','카메라','유형','신뢰도','탐지 내용','이미지','영상']];
    filtered.forEach(function(e){rows.push([dateTime(e),camLabel(e.cam_id),text(e.type),confidence(e),text(e.message),text(e.image_url||''),text(e.video_url||'')]);});
    var csv='\ufeff'+rows.map(function(r){return r.map(csvCell).join(',');}).join('\r\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='detection_history_'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
  }
  fetch('/event_history?limit=1000',{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json();}).then(function(p){
    allEvents=sortEvents(Array.isArray(p.events)?p.events:[]);filtered=allEvents.slice();render();
  }).catch(function(){ $('history-body').innerHTML='<tr><td colspan="6">탐지 기록을 불러오지 못했습니다.</td></tr>';$('history-count').textContent='조회 실패';});
  $('search-history').addEventListener('click',applyFilters);$('reset-history').addEventListener('click',function(){['date-from','date-to','history-keyword'].forEach(function(id){$(id).value='';});$('history-camera').value='all';$('history-type').value='all';filtered=allEvents.slice();page=1;render();});
  $('history-keyword').addEventListener('keydown',function(e){if(e.key==='Enter')applyFilters();});
  $('prev-page').addEventListener('click',function(){if(page>1){page--;render();}});
  $('next-page').addEventListener('click',function(){if(page*pageSize<filtered.length){page++;render();}});
  $('download-csv').addEventListener('click',downloadCsv);
})();