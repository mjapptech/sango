/* ============ 三國志IV式 野戰（rtkb） ============
   契約與 showTacticBattle 相同：rtkBattle(aFid,dFid,city,aTr0,dTr0,aGens,dGens,onResult,fromCity)
   結果 onResult({winner:'atk'|'def', aLeft, dLeft})，applyBattle 直接沿用 */
var RB=null, rbRAF=0;
const RB_COLS=38, RB_ROWS=24, RB_T=36;   // 2026-07-04 依用戶：格子長寬×2（不是放大）
/* 地形碼：0草 1草2 2林 3丘 4山(不可通行) 5水(不可通行) 8陣 9焦土；本陣以 camp 座標另記 */
const RB_MOVECOST={0:1,1:1,2:2,3:3,9:1,8:1};
const RB_DEFBON ={0:1,1:1,2:1.2,3:1.3,8:1.35,9:1};
const RB_WX=[['☀','晴'],['⛅','陰'],['🌧','雨']];
const RB_WIND=[['北',0,-1],['南',0,1],['東',1,0],['西',-1,0]];
const RB_TNAME={0:'平地',1:'平地',2:'森林',3:'丘陵',4:'山岳',5:'河川',8:'陣地',9:'焦土'};
/* 各地域配色（依 CITY_REGION：西涼黃沙/河北草原/中原平野/巴蜀山地/江南水鄉） */
const RB_PAL={
  west :{g1:'#b0985a',g2:'#a68e50',tree:'#6a7a34',treeN:3, hillN:8, mtN:4, river:false},
  north:{g1:'#7e9a48',g2:'#748e40',tree:'#2e5c26',treeN:5, hillN:6, mtN:2, river:false},
  plain:{g1:'#5a8a3c',g2:'#548238',tree:'#2e5c26',treeN:7, hillN:3, mtN:0, river:false},
  shu  :{g1:'#4a7a40',g2:'#427238',tree:'#24501e',treeN:8, hillN:9, mtN:6, river:false},
  south:{g1:'#3e7a34',g2:'#38722e',tree:'#1e4a18',treeN:12,hillN:2, mtN:0, river:true}};

/* ===== 戰場策略（依武將能力＋相性派系；可經事件習得 g.xTacts）===== */
const RB_TACTS={
  fire:  {n:'火計', icon:'🔥', rng:1, uses:2, tgt:'tile', need:g=>g.int>=70, desc:'放火燒敵，順風蔓延（雨天不可）'},
  ambush:{n:'伏兵', icon:'🌿', rng:2, uses:1, tgt:'enemy', need:g=>g.int>=82, desc:'設伏奇襲：折兵一成五、敵當日不能動'},
  chaos: {n:'混亂', icon:'😵', rng:2, uses:1, tgt:'enemy', need:g=>g.int>=88, desc:'計亂敵心：士氣大降、敵當日不能動'},
  taunt: {n:'罵聲', icon:'🗯️', rng:2, uses:2, tgt:'enemy', need:g=>g.war>=75||g.int>=75, desc:'陣前叫罵：敵士氣 -12'},
  rally: {n:'鼓舞', icon:'🥁', rng:0, uses:2, tgt:'self',  need:g=>g.ldr>=80, desc:'擂鼓助威：鄰接友軍與自身士氣 +14'},
  charge:{n:'突擊', icon:'🐎', rng:1, uses:2, tgt:'enemy', need:g=>g.war>=86, desc:'捨身猛攻：傷害 +50%，自身士氣 -5'},
  wall:  {n:'堅陣', icon:'🛡️', rng:0, uses:2, tgt:'self',  need:g=>g.ldr>=84, desc:'結陣固守：到下一日受傷 -50%'},
  volley:{n:'連弩', icon:'🏹', rng:2, uses:2, tgt:'enemy', need:g=>g.int>=76&&g.war>=55, desc:'連射兩輪（限弩隊）'},
  rocks: {n:'落石', icon:'🪨', rng:1, uses:1, tgt:'enemy', need:g=>g.ldr>=70, desc:'居高擲石：自身鄰接丘/山時重創敵隊'},
  heal:  {n:'治軍', icon:'🌾', rng:0, uses:1, tgt:'self',  need:g=>g.int>=72&&g.ldr>=70, desc:'收攏散卒：恢復 6% 兵力'},
  sky:   {n:'天變', icon:'🌩️', rng:0, uses:1, tgt:'self',  need:g=>g.int>=95, desc:'仙術喚天：晴雨逆轉（智95+專屬）'},
  wind:  {n:'風變', icon:'🌀', rng:0, uses:1, tgt:'self',  need:g=>g.int>=92, desc:'仙術御風：指定風向（智92+專屬）'},
  /* ── 名將專屬戰法（綁武將名）── */
  h_lvbu:  {n:'天下無雙', icon:'⚡', rng:1, uses:1, tgt:'enemy', need:g=>g.n==='呂布',   desc:'呂布專屬：鬼神之擊，傷害×2.2'},
  h_guanyu:{n:'武聖',     icon:'🟩', rng:1, uses:1, tgt:'enemy', need:g=>g.n==='關羽',   desc:'關羽專屬：青龍偃月重斬，傷害×1.8 並奪氣'},
  h_zhangfei:{n:'燕人咆哮',icon:'📣', rng:0, uses:1, tgt:'self',  need:g=>g.n==='張飛',   desc:'張飛專屬：2格內全部敵隊士氣-18、有機率嚇止'},
  h_zhaoyun:{n:'龍膽',    icon:'🐉', rng:1, uses:1, tgt:'enemy', need:g=>g.n==='趙雲',   desc:'趙雲專屬：七進七出，猛擊且不受反擊'},
  h_machao:{n:'西涼鐵騎', icon:'🏇', rng:0, uses:1, tgt:'self',  need:g=>g.n==='馬超',   desc:'馬超專屬：神速——本隊立即再行動一次'},
  h_huangzhong:{n:'百步穿楊',icon:'🎯',rng:3, uses:1, tgt:'enemy', need:g=>g.n==='黃忠',   desc:'黃忠專屬：3格狙擊，重創兵力士氣、無反擊'},
  h_zhouyu:{n:'業火',     icon:'🌋', rng:1, uses:1, tgt:'tile',  need:g=>g.n==='周瑜',   desc:'周瑜專屬：放火並向順風連燒三格'},
  h_luxun: {n:'燎原',     icon:'🌋', rng:1, uses:1, tgt:'tile',  need:g=>g.n==='陸遜',   desc:'陸遜專屬：放火並向順風連燒三格'},
  h_kongming:{n:'八陣圖', icon:'☯',  rng:0, uses:1, tgt:'self',  need:g=>g.n==='諸葛亮', desc:'諸葛亮專屬：我方全體本日受傷減半'},
  h_sima:  {n:'深謀',     icon:'🌑', rng:2, uses:1, tgt:'enemy', need:g=>g.n==='司馬懿', desc:'司馬懿專屬：攻心——敵士氣-25 且當日不能動'},
  h_caocao:{n:'亂世奸雄', icon:'👑', rng:2, uses:1, tgt:'enemy', need:g=>g.n==='曹操',   desc:'曹操專屬：威壓敵膽-20，我全軍士氣+8'},
  h_liubei:{n:'仁德',     icon:'🕊️', rng:0, uses:1, tgt:'self',  need:g=>g.n==='劉備',   desc:'劉備專屬：仁者之師——我方全體士氣+15、回兵3%'},
  h_sunce: {n:'小霸王',   icon:'🐯', rng:1, uses:1, tgt:'enemy', need:g=>g.n==='孫策',   desc:'孫策專屬：霸王突擊，傷害×1.8 並奪氣'},
  h_ganning:{n:'百騎劫營',icon:'🌙', rng:99,uses:1, tgt:'enemy', need:g=>g.n==='甘寧',   desc:'甘寧專屬：夜襲——奇襲戰場上任一敵隊'},
  h_xuchu: {n:'虎痴',     icon:'🐅', rng:0, uses:1, tgt:'self',  need:g=>g.n==='許褚'||g.n==='典韋', desc:'許褚/典韋專屬：鐵壁之軀，本日受傷-70%'},
};
/* 相性(0-99環形)決定派系 → 同能力的武將學到的策略不同 */
const RB_SCHOOL=[
  {n:'火攻派', pref:['fire','rocks','taunt','charge']},
  {n:'詭道派', pref:['ambush','chaos','fire','taunt']},
  {n:'軍略派', pref:['wall','heal','rally','volley']},
  {n:'驍勇派', pref:['charge','taunt','rally','rocks']},
  {n:'奇兵派', pref:['volley','ambush','heal','wall']}];
/* 史實戰法對照：名將依歷史事蹟指定策略（其餘武將才用能力＋相性推導） */
const RB_HIST={
 /* 魏 */
 '曹操':['chaos','taunt','rally'],            // 兵詭權謀
 '司馬懿':['wall','ambush','heal'],           // 堅守拒葛、剋日擒孟達
 '郭嘉':['chaos','ambush','fire'],            // 遺計定遼東
 '荀彧':['wall','heal','rally'],              // 居中持重
 '荀攸':['ambush','chaos','fire'],            // 奇策十二
 '賈詡':['ambush','chaos','taunt'],           // 毒士亂武
 '程昱':['ambush','wall','fire'],
 '張遼':['charge','rally','ambush'],          // 八百破十萬、威震逍遙津
 '張郃':['ambush','wall','charge'],           // 巧變之將
 '徐晃':['wall','heal','charge'],             // 周亞夫之風
 '夏侯惇':['charge','rally','wall'],
 '夏侯淵':['charge','volley','fire'],         // 虎步關右、急襲燒糧
 '許褚':['charge','wall','rally'],
 '典韋':['charge','wall','rally'],
 '于禁':['wall','heal','rally'],              // 最號毅重
 '樂進':['charge','rally','taunt'],           // 每戰先登
 '鄧艾':['ambush','rocks','wall'],            // 偷渡陰平
 '鍾會':['chaos','ambush','rally'],
 '曹仁':['wall','charge','heal'],             // 死守樊城
 '郝昭':['wall','volley','heal'],             // 陳倉拒亮
 '龐德':['charge','wall','taunt'],            // 抬櫬決死
 /* 蜀 */
 '劉備':['rally','heal','taunt'],
 '諸葛亮':['fire','chaos','heal'],            // 火燒博望/藤甲
 '龐統':['fire','chaos','ambush'],            // 連環計
 '法正':['ambush','chaos','fire'],            // 定軍山奇謀
 '關羽':['charge','sky','rally'],             // 水淹七軍（天變喚雨）
 '張飛':['charge','taunt','wall'],            // 據水斷橋
 '趙雲':['charge','wall','heal'],             // 空營計
 '馬超':['charge','taunt','volley'],
 '黃忠':['volley','charge','rally'],          // 定軍山斬淵
 '魏延':['charge','ambush','taunt'],          // 子午谷奇謀
 '姜維':['ambush','chaos','charge'],
 '王平':['wall','rocks','heal'],              // 街亭當道下寨
 '馬謖':['taunt','rocks','chaos'],            // 屯兵山上……
 '徐庶':['chaos','ambush','wall'],
 /* 吳 */
 '孫堅':['charge','rally','taunt'],
 '孫策':['charge','taunt','rally'],
 '孫權':['rally','wall','heal'],
 '周瑜':['fire','chaos','rally'],             // 赤壁縱火
 '魯肅':['heal','wall','rally'],
 '呂蒙':['ambush','fire','heal'],             // 白衣渡江
 '陸遜':['fire','ambush','wall'],             // 火燒連營
 '甘寧':['charge','taunt','fire'],
 '太史慈':['volley','charge','rally'],        // 神射
 '黃蓋':['fire','charge','heal'],             // 苦肉火船
 '周泰':['wall','charge','heal'],             // 濺血護主
 '程普':['rally','wall','fire'],
 /* 群雄 */
 '呂布':['charge','taunt','volley'],          // 轅門射戟
 '董卓':['taunt','charge','fire'],            // 火焚洛陽
 '袁紹':['rally','wall','taunt'],
 '袁術':['taunt','wall','rally'],
 '公孫瓚':['charge','volley','rally'],        // 白馬義從
 '馬騰':['charge','rally','taunt'],
 '張魯':['heal','wall','rally'],              // 五斗米道治病救人
 '高順':['charge','wall','rally'],            // 陷陣營
 '張任':['ambush','volley','wall'],           // 落鳳坡
 '陳宮':['ambush','chaos','wall'],
 '許攸':['chaos','fire','taunt'],             // 火燒烏巢
 '田豐':['chaos','wall','heal'],
 '沮授':['chaos','wall','heal'],
 '顏良':['charge','taunt','volley'],
 '文醜':['charge','taunt','volley'],
 '華雄':['charge','taunt','rally'],
 '嚴顏':['wall','rally','charge'],
 '霍去病':['charge','ambush','rally'],        // 長途奔襲
 '蘇定方':['charge','volley','wall'],
};
function rbGenTacts(g){
  const aff=(typeof ginfo!=='undefined')?ginfo(g.n)[0]:50;
  const school=RB_SCHOOL[Math.floor(aff/20)%5];
  const picked=[];
  if(RB_HIST[g.n]){
    // 名將：史實指定（可突破能力門檻，如關羽水淹七軍得天變）
    RB_HIST[g.n].forEach(id=>{ if(RB_TACTS[id]&&!picked.includes(id))picked.push(id); });
  } else {
    // 一般武將：能力門檻＋相性派系推導
    const elig=Object.keys(RB_TACTS).filter(id=>!id.startsWith('h_')&&RB_TACTS[id].need(g));
    school.pref.forEach(id=>{ if(picked.length<3&&elig.includes(id))picked.push(id); });
    elig.forEach(id=>{ if(picked.length<3&&!picked.includes(id))picked.push(id); });
  }
  if(!picked.length) picked.push('taunt');   // 保底
  // 仙術（天變/風變）＝高智武將專屬，另計不佔 3 格
  if(g.int>=95&&!picked.includes('sky')) picked.push('sky');
  if(g.int>=92&&!picked.includes('wind')) picked.push('wind');
  // 名將專屬戰法（綁武將名，另計）
  Object.keys(RB_TACTS).forEach(id=>{ if(id.startsWith('h_')&&RB_TACTS[id].need(g)&&!picked.includes(id))picked.push(id); });
  // 事件習得的額外策略
  (g.xTacts||[]).forEach(id=>{ if(RB_TACTS[id]&&!picked.includes(id))picked.push(id); });
  return picked;
}
function rbSchoolName(g){ const aff=(typeof ginfo!=='undefined')?ginfo(g.n)[0]:50; return RB_SCHOOL[Math.floor(aff/20)%5].n; }

function rbGenTerrain(city, atkFromRight){
  // 地形依城池地域（CITY_REGION：西涼黃沙/河北草原/中原平野/巴蜀山地/江南水鄉）
  const region=(typeof CITY_REGION!=='undefined'&&CITY_REGION[city.n])||'plain';
  const P=RB_PAL[region]||RB_PAL.plain;
  const m=[];
  for(let r=0;r<RB_ROWS;r++){ m.push([]); for(let c=0;c<RB_COLS;c++) m[r].push(Math.random()<0.22?1:0); }
  const blob=(code,cnt,edge)=>{ for(let k=0;k<cnt;k++){
    let r=ri(0,RB_ROWS-1), c=edge==='side'?(Math.random()<0.5?ri(0,2):ri(RB_COLS-3,RB_COLS-1)):ri(3,RB_COLS-4);
    const sz=ri(2,5);
    for(let i=0;i<sz;i++){ if(m[r]&&m[r][c]!=null&&m[r][c]<2) m[r][c]=code; r+=ri(-1,1); c+=ri(-1,1);
      r=Math.max(0,Math.min(RB_ROWS-1,r)); c=Math.max(0,Math.min(RB_COLS-1,c)); } } };
  blob(2, P.treeN*3);                 // 林（依地域密度；大地圖×3）
  blob(3, P.hillN*3,'side');          // 丘（多在兩側）
  if(P.mtN) blob(4, P.mtN*3,'side');  // 山（巴蜀/西涼）
  if(P.river){                       // 江南：河道（縱向蜿蜒）＋兩處渡口
    let c=ri(14,22);
    for(let r=0;r<RB_ROWS;r++){ m[r][c]=5; if(Math.random()<0.5&&m[r][c+1]!=null)m[r][c+1]=5; c+=ri(-1,1); c=Math.max(8,Math.min(RB_COLS-9,c)); }
    [ri(2,Math.floor(RB_ROWS/2)-1),ri(Math.floor(RB_ROWS/2)+1,RB_ROWS-3)].forEach(fr=>{ for(let cc=0;cc<RB_COLS;cc++) if(m[fr][cc]===5)m[fr][cc]=0; });
  }
  // 本陣＋守方陣地
  const aC=atkFromRight?RB_COLS-2:1, dC=atkFromRight?1:RB_COLS-2;
  const aCamp={r:Math.floor(RB_ROWS/2), c:aC}, dCamp={r:Math.floor(RB_ROWS/2), c:dC};
  [[aCamp.r,aCamp.c],[dCamp.r,dCamp.c]].forEach(([r,c])=>{ m[r][c]=0;
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(m[rr]&&m[rr][cc]!=null&&m[rr][cc]>=4)m[rr][cc]=0; }); });
  // 守方前沿佈陣（仿 RTK4 陣點）
  const sgn=atkFromRight?1:-1;
  for(let i=0;i<10;i++){ const r=ri(1,RB_ROWS-2), c=dCamp.c+sgn*ri(2,7);
    if(m[r]&&m[r][c]!=null&&m[r][c]<2) m[r][c]=8; }
  return {m,region,aCamp,dCamp};
}

function rbUnitType(g){ return g.war>=85?'cav':(g.int>=78?'bow':'inf'); }
function rbMkUnits(gens,tr0,side,camp,atkFromRight){
  const n=Math.max(1,Math.min(6,gens.length));
  const per=Math.floor(tr0/n);
  const sgn=side===0?(atkFromRight?-1:1):(atkFromRight?1:-1);
  return gens.slice(0,6).map((g,i)=>{
    const ty=rbUnitType(g);
    const tacts={}; rbGenTacts(g).forEach(id=>tacts[id]=RB_TACTS[id].uses);
    return { g, side, tr:per+(i===0?tr0-per*n:0), mor:side===0?85:75,
      type:ty, mov:ty==='cav'?6:5, rng:ty==='bow'?2:1,
      r:Math.max(0,Math.min(RB_ROWS-1, camp.r+(i-Math.floor(n/2))*2)),
      c:Math.max(0,Math.min(RB_COLS-1, camp.c+sgn*(1+(i%2)))),
      tacts, stun:false, guard:false,
      done:false, dueled:false };
  });
}

function rtkBattle(aFid,dFid,city,aTr0,dTr0,aGens,dGens,onResult,fromCity){
  if(!dGens||dGens.length===0){   // 無守將 → 直接模擬（同舊行為）
    const simRes=simulateBattle({fid:aFid,tr:aTr0,gens:aGens,morale:80},{fid:dFid,tr:dTr0,gens:[],morale:50},city);
    if(onResult) onResult(simRes); return;
  }
  const atkFromRight=fromCity&&(fromCity.x-city.x)>60;
  const T=rbGenTerrain(city,atkFromRight);
  const aU=rbMkUnits(aGens,aTr0,0,T.aCamp,atkFromRight);
  const dU=rbMkUnits(dGens,dTr0,1,T.dCamp,atkFromRight);
  // 開戰時佔用格去重
  const occ={}; [...aU,...dU].forEach(u=>{ let k=u.r+','+u.c; while(occ[k]||T.m[u.r][u.c]>=4){ u.r=(u.r+1)%RB_ROWS; k=u.r+','+u.c; } occ[k]=1; });
  RB={ aFid,dFid,city,onResult, m:T.m, region:T.region, aCamp:T.aCamp, dCamp:T.dCamp,
    units:[...aU,...dU], day:1, maxDay:30,
    wx:0, wind:ri(0,3),
    aFood:Math.round(aTr0*0.35), dFood:Math.round(dTr0*0.5),
    fire:{},                    // 'r,c' -> 剩餘天數
    sel:null, mvRange:null, phase:'player',   // player | ai | anim | over
    prevTrack:(typeof bgmTrack!=='undefined'?bgmTrack:0), msgs:[] };
  $('#rtkB').classList.add('on');
  $('#rtkLoc').textContent=city.n+'附近';
  $('#rtkAn').textContent=fName(aFid); $('#rtkDn').textContent=fName(dFid);
  if(typeof bgmRun!=='undefined'&&bgmRun) bgmSetTrack(1);
  rbMsg(`${fName(dFid)}軍於 ${city.n} 佈陣迎擊！主公，讓部隊做什麼？`);
  rbNewDay(true);
  const cv=$('#rtkCv'); cv.width=RB_COLS*RB_T*2; cv.height=RB_ROWS*RB_T*2;   // 2×超取樣：文字清晰
  cancelAnimationFrame(rbRAF); rbLoop();
  rbRefreshTop();
}

/* 戰場特效：目標格 icon 彈出＋數字飄浮（1 秒） */
function rbFx(r,c,icon,txt,color){ if(!RB)return; RB.efx=RB.efx||[]; RB.efx.push({r,c,icon,txt,color:color||'#ffe9a8',t0:performance.now()}); }
function rbMsg(t){ RB.msgs.push(t); if(RB.msgs.length>2)RB.msgs.shift(); $('#rtkMsg').innerHTML=RB.msgs.map(esc0=>esc0).join('<br>'); }
function rbRefreshTop(){
  const A=RB.units.filter(u=>u.side===0&&u.tr>0), D=RB.units.filter(u=>u.side===1&&u.tr>0);
  $('#rtkDate').textContent=`${state.year}年${state.month}月${RB.day}日`;
  $('#rtkWx').textContent=RB_WX[RB.wx][0]+' '+RB_WIND[RB.wind][0]+'風';
  $('#rtkAtr').textContent=fmt(A.reduce((s,u)=>s+u.tr,0));
  $('#rtkDtr').textContent=fmt(D.reduce((s,u)=>s+u.tr,0));
  $('#rtkAfd').textContent=fmt(Math.max(0,RB.aFood));
  $('#rtkDfd').textContent=fmt(Math.max(0,RB.dFood));
  $('#rtkDayLeft').textContent=`限${RB.maxDay}日（剩${Math.max(0,RB.maxDay-RB.day)}日）`;
}
function rbNewDay(first){
  if(!first){ RB.day++;
    RB.wx=Math.random()<0.55?0:(Math.random()<0.65?1:2);
    const oldWind=RB.wind;
    if(Math.random()<0.4) RB.wind=ri(0,3);
    if(RB.wind!==oldWind) rbMsg(`🌬 風向轉為${RB_WIND[RB.wind][0]}風${Object.keys(RB.fire).length?'，火勢隨風而變！':''}`);
    if(RB.wx===2) rbMsg('🌧 天降大雨，火計不可用');
    // 兵糧消耗
    const aT=RB.units.filter(u=>u.side===0&&u.tr>0).reduce((s,u)=>s+u.tr,0);
    const dT=RB.units.filter(u=>u.side===1&&u.tr>0).reduce((s,u)=>s+u.tr,0);
    RB.aFood-=Math.round(aT*0.012); RB.dFood-=Math.round(dT*0.012);
    [[0,RB.aFood],[1,RB.dFood]].forEach(([sd,fd])=>{ if(fd<0) RB.units.filter(u=>u.side===sd&&u.tr>0).forEach(u=>{ u.mor=Math.max(5,u.mor-6); u.tr=Math.floor(u.tr*0.97); }); });
    if(RB.aFood<0&&RB.day%3===0) rbMsg('⚠ 我軍糧秣告罄，士卒逃散！');
    // 火勢蔓延/熄滅
    rbFireSpread();
  }
  RB.units.forEach(u=>{
    u.guard=false; u.guard70=false; u.moved=false; u._from=null;
    if(u.stun){ u.done=true; u.stun=false; if(u.tr>0)rbMsg(`${u.g.n}隊軍心未定，本日無法行動`); }
    else u.done=false;
  });
  RB.phase='player'; RB.sel=null; RB.mvRange=null;
  rbRefreshTop();
  if(!first) rbCheckEnd();   // 限期/糧盡等非交戰結束條件也要每日判定
}
function rbFireSpread(){
  const nf={};
  const flam=v=>v===0||v===1||v===2;
  Object.keys(RB.fire).forEach(k=>{
    let d=RB.fire[k]-1;
    if(RB.wx===2) d=0;             // 雨天熄滅
    const [r,c]=k.split(',').map(Number);
    if(d<=0){ RB.m[r][c]=9; return; }
    nf[k]=d;
    // 順風向蔓延＋隨機
    const [,dx,dy]=RB_WIND[RB.wind];
    const tries=[[r+dy,c+dx],[r+ri(-1,1),c+ri(-1,1)]];
    tries.forEach(([rr,cc])=>{ if(RB.m[rr]&&RB.m[rr][cc]!=null&&flam(RB.m[rr][cc])&&!nf[rr+','+cc]&&Math.random()<(RB.wx===0?0.6:0.35)) nf[rr+','+cc]=2; });
  });
  RB.fire=nf;
  // 燒到部隊
  RB.units.forEach(u=>{ if(u.tr>0&&RB.fire[u.r+','+u.c]){ const dmg=Math.floor(u.tr*rnd(0.08,0.14)); u.tr-=dmg; u.mor=Math.max(5,u.mor-10);
    rbMsg(`🔥 ${u.g.n}隊陷於火場，折兵 ${fmt(dmg)}！`); } });
}

/* ---- 尋路（依移動力與地形成本的可達範圍） ---- */
function rbReach(u){
  const res={}, q=[[u.r,u.c,0]];
  res[u.r+','+u.c]=0;
  const occ={}; RB.units.forEach(x=>{ if(x.tr>0&&x!==u) occ[x.r+','+x.c]=x.side; });
  while(q.length){
    const [r,c,d]=q.shift();
    [[r+1,c],[r-1,c],[r,c+1],[r,c-1]].forEach(([rr,cc])=>{
      if(!RB.m[rr]||RB.m[rr][cc]==null) return;
      const t=RB.m[rr][cc]; if(t===4||t===5) return;
      if(occ[rr+','+cc]!=null) return;                       // 不可穿越部隊
      if(RB.fire[rr+','+cc]) return;                          // 不入火場
      const nd=d+(RB_MOVECOST[t]||1);
      if(nd>u.mov) return;
      const k=rr+','+cc;
      if(res[k]==null||res[k]>nd){ res[k]=nd; q.push([rr,cc,nd]); }
    });
  }
  delete res[u.r+','+u.c];
  return res;
}
function rbEnemiesInRange(u){
  return RB.units.filter(e=>e.side!==u.side&&e.tr>0&&(Math.abs(e.r-u.r)+Math.abs(e.c-u.c))<=u.rng);
}

/* ---- 戰鬥計算 ---- */
function rbAttack(u,e,done,opt){
  opt=opt||{};
  const terD=RB_DEFBON[RB.m[e.r][e.c]]||1;
  const camp=(e.side===1&&e.r===RB.dCamp.r&&e.c===RB.dCamp.c)||(e.side===0&&e.r===RB.aCamp.r&&e.c===RB.aCamp.c);
  const typeMul=(u.type==='cav'&&RB.m[e.r][e.c]<=1)?1.25:1;   // 騎兵平地衝鋒
  // 單挑（雙方勇將）
  const tryDuel=(u.g.war>=80&&e.g.war>=80&&!u.dueled&&!e.dueled&&Math.random()<0.18);
  const doDmg=(duelWin)=>{
    let mul=typeMul*(duelWin==='atk'?1.5:duelWin==='def'?0.6:1)*(opt.mul||1);
    if(e.guard) mul*=(e.guard70?0.3:0.5);   // 堅陣：受傷減半／虎痴 -70%
    const dmg=Math.max(50,Math.floor(u.tr*0.13*(1+u.g.war/220)*(u.mor/100)*mul/(terD*(camp?1.4:1))*rnd(0.85,1.15)));
    const back=Math.max(0,Math.floor(e.tr*0.06*(1+e.g.ldr/250)*(e.mor/100)*rnd(0.8,1.1)*(u.rng>1?0:1)));   // 弓兵不受反擊
    e.tr-=dmg; u.tr-=back;
    e.mor=Math.max(5,e.mor-4); u.mor=Math.min(100,u.mor+2);
    rbFx(e.r,e.c,'⚔','-'+fmt(dmg),'#ff7a5a');
    if(back)rbFx(u.r,u.c,'',' -'+fmt(back),'#ffb0a0');
    rbMsg(`⚔ ${u.g.n}隊攻擊${e.g.n}隊：敵折 ${fmt(dmg)}${back?`，我損 ${fmt(back)}`:''}`);
    if(e.tr<=0){ e.tr=0; rbMsg(`💥 ${e.g.n}隊潰滅！`); u.mor=Math.min(100,u.mor+10); }
    if(u.tr<=0){ u.tr=0; rbMsg(`💥 ${u.g.n}隊潰滅！`); }
    u.done=true; rbRefreshTop(); rbCheckEnd(); if(done)done();
  };
  if(tryDuel){
    u.dueled=e.dueled=true;
    const aRoll=u.g.war+rnd(0,28), dRoll=e.g.war+rnd(0,28);
    const win=aRoll>=dRoll?'atk':'def';
    const du={a:u.g,d:e.g,af:u.side===0?RB.aFid:RB.dFid,df:e.side===0?RB.aFid:RB.dFid,win,n:2+ri(0,2)};
    RB.phase='anim';
    showDuel(du,()=>{ RB.phase='player';
      if(win==='atk'){ e.mor=Math.max(5,e.mor-18); rbMsg(`🗡 ${u.g.n} 陣前斬將奪氣！`); }
      else { u.mor=Math.max(5,u.mor-18); rbMsg(`🗡 ${e.g.n} 技高一籌，我軍奪氣！`); }
      doDmg(win); });
  } else doDmg(null);
}
function rbFireAttack(u,r,c){
  if(u.tacts&&u.tacts.fire>0) u.tacts.fire--;
  const rate=Math.min(0.9,u.g.int/110)*(RB.wx===2?0:(RB.wx===0?1:0.7));
  if(Math.random()<rate){ RB.fire[r+','+c]=3; rbFx(r,c,'🔥','火起！','#ff9040'); rbMsg(`🔥 ${u.g.n} 火計得逞，${RB.wx===0?'烈焰順風而起':'火勢燃起'}！`); }
  else rbMsg(`${u.g.n} 火計未能得逞……`);
  u.done=true; rbCheckEnd();
}

/* 主動單挑：相鄰敵將，對方衡量武力差可拒絕；接原版 showDuel 對決畫面 */
function rbChallenge(u,e){
  u.dueled=true;
  const acc=Math.max(0.15,Math.min(0.95,0.8-(u.g.war-e.g.war)/45));   // 我強敵弱→對方多半拒絕
  if(Math.random()>acc){
    rbFx(e.r,e.c,'🗯️','拒絕出戰','#c8c8c8');
    rbMsg(`${e.g.n}：「不與匹夫逞勇！」拒絕了 ${u.g.n} 的搦戰（本隊仍可行動）`);
    return;   // 不消耗行動
  }
  const aRoll=u.g.war+rnd(0,28), dRoll=e.g.war+rnd(0,28);
  const win=aRoll>=dRoll?'atk':'def';
  const du={a:u.g,d:e.g,af:u.side===0?RB.aFid:RB.dFid,df:e.side===0?RB.aFid:RB.dFid,win,n:2+ri(0,2)};
  RB.phase='anim';
  showDuel(du,()=>{ RB.phase='player';
    const loser=win==='atk'?e:u, winner=win==='atk'?u:e;
    const d=Math.floor(loser.tr*0.25);
    loser.tr-=d; loser.mor=Math.max(5,loser.mor-20); winner.mor=Math.min(100,winner.mor+12);
    rbFx(loser.r,loser.c,'🗡','-'+fmt(d),'#ff7a5a');
    rbMsg(`🗡 陣前單挑！${winner.g.n} 勝——${loser.g.n}隊折兵 ${fmt(d)}、士氣大挫`);
    if(loser.tr<=0){ loser.tr=0; rbMsg(`💥 ${loser.g.n}隊潰滅！`); }
    u.done=true; rbRefreshTop(); if(!rbCheckEnd())rbAfterAct();
  });
}
/* ---- 勝負 ---- */
function rbAlive(sd){ return RB.units.filter(u=>u.side===sd&&u.tr>0); }
function rbCheckEnd(){
  if(!RB||RB.phase==='over') return false;
  const A=rbAlive(0), D=rbAlive(1);
  const aOnCamp=A.some(u=>u.r===RB.dCamp.r&&u.c===RB.dCamp.c);
  const dOnCamp=D.some(u=>u.r===RB.aCamp.r&&u.c===RB.aCamp.c);
  let winner=null,why='';
  if(!D.length||aOnCamp){ winner='atk'; why=aOnCamp?'我軍攻佔敵本陣！':'守軍全數潰滅！'; }
  else if(!A.length||dOnCamp){ winner='def'; why=dOnCamp?'本陣失守……':'我軍全軍潰滅……'; }
  else if(RB.day>=RB.maxDay){ winner='def'; why='師老兵疲，攻城期限已至，只得撤兵。'; }
  if(winner){ rbFinish(winner,why); return true; }
  return false;
}
function rbFinish(winner,why){
  RB.phase='over';
  const aLeft=rbAlive(0).reduce((s,u)=>s+u.tr,0), dLeft=rbAlive(1).reduce((s,u)=>s+u.tr,0);
  const playerWon=(winner==='atk'&&RB.aFid===state.player)||(winner==='def'&&RB.dFid===state.player);
  $('#rtkEndT').textContent=playerWon?'🏆 勝利':'💀 敗北';
  $('#rtkEndS').innerHTML=`${why}<br>攻方殘兵 ${fmt(aLeft)}　守方殘兵 ${fmt(dLeft)}`;
  $('#rtkEnd').classList.add('on');
  $('#rtkEndOk').onclick=()=>{
    $('#rtkEnd').classList.remove('on');
    rbClose({winner,aLeft,dLeft});
  };
}
function rbClose(res){
  cancelAnimationFrame(rbRAF);
  $('#rtkB').classList.remove('on'); $('#rtkMenu').style.display='none'; $('#rtkInfo').classList.remove('on');
  const cb=RB.onResult, prev=RB.prevTrack; RB=null;
  if(typeof bgmRun!=='undefined'&&bgmRun) bgmSetTrack(prev);
  if(cb&&res) cb(res);
}

/* ---- 敵方 AI ---- */
function rbAiTurn(){
  RB.phase='ai'; rbMsg(`${fName(RB.dFid)}軍行動……`);
  const foes=rbAlive(1);
  let i=0;
  const step=()=>{
    if(!RB||RB.phase==='over') return;
    if(i>=foes.length){ rbNewDay(); rbMsg(`${state.month}月${RB.day}日。主公，讓部隊做什麼？`); return; }
    const u=foes[i++]; if(u.tr<=0||u.done){ step(); return; }
    // AI 也會用策略：士氣低先鼓舞
    if(u.tacts&&u.tacts.rally>0&&u.mor<55){ u.tacts.rally--; u.mor=Math.min(100,u.mor+14);
      RB.units.forEach(a=>{ if(a!==u&&a.side===u.side&&a.tr>0&&Math.abs(a.r-u.r)+Math.abs(a.c-u.c)<=1)a.mor=Math.min(100,a.mor+14); });
      rbMsg(`🥁 敵將 ${u.g.n} 擂鼓振軍！`); u.done=true; setTimeout(step,200); return; }
    // 攻擊優先
    const tg=rbEnemiesInRange(u);
    if(tg.length){ const e=tg.reduce((b,x)=>x.tr<b.tr?x:b); rbAttack(u,e,()=>setTimeout(step,260)); return; }
    // 守本陣型：敵離本陣>5 時駐守陣地，否則迎擊
    const A=rbAlive(0);
    if(A.length){
      const near=A.reduce((b,x)=>{ const d=Math.abs(x.r-u.r)+Math.abs(x.c-u.c); return d<b[0]?[d,x]:b; },[999,null]);
      const [dist,tgt]=near;
      const guard=Math.abs(u.c-RB.dCamp.c)<=1&&dist>5;
      if(!guard&&tgt){
        const reach=rbReach(u);
        let best=null,bd=dist;
        Object.keys(reach).forEach(k=>{ const [rr,cc]=k.split(',').map(Number);
          const d=Math.abs(rr-tgt.r)+Math.abs(cc-tgt.c);
          if(d<bd){ bd=d; best=[rr,cc]; } });
        if(best){ u.r=best[0]; u.c=best[1]; }
        const tg2=rbEnemiesInRange(u);
        if(tg2.length){ const e=tg2.reduce((b,x)=>x.tr<b.tr?x:b);
          // AI 突擊：有策略且可用時 40% 機率
          if(u.tacts&&u.tacts.charge>0&&Math.random()<0.4){ u.tacts.charge--; u.mor=Math.max(5,u.mor-5); rbMsg(`🐎 敵將 ${u.g.n} 突擊！`); rbAttack(u,e,()=>setTimeout(step,260),{mul:1.5}); }
          else rbAttack(u,e,()=>setTimeout(step,260));
          return; }
      }
    }
    u.done=true; setTimeout(step,140);
  };
  setTimeout(step,300);
}

/* ---- 玩家操作 ---- */
function rbPlayerSide(){ return RB.aFid===state.player?0:1; }
function rbCanvasPos(ev){
  const cv=$('#rtkCv'), rect=cv.getBoundingClientRect();
  // 扣除邊框（getBoundingClientRect 含 border，繪圖區不含）
  const bw=cv.clientWidth||((rect.width)-(cv.clientLeft||0)*2), bh=cv.clientHeight||((rect.height)-(cv.clientTop||0)*2);
  const x=(ev.clientX-rect.left-(cv.clientLeft||0))*(RB_COLS*RB_T)/bw;
  const y=(ev.clientY-rect.top-(cv.clientTop||0))*(RB_ROWS*RB_T)/bh;
  return {c:Math.floor(x/RB_T), r:Math.floor(y/RB_T)};
}
function rbAdjHill(u){ return [[u.r+1,u.c],[u.r-1,u.c],[u.r,u.c+1],[u.r,u.c-1],[u.r,u.c]].some(([r,c])=>RB.m[r]&&(RB.m[r][c]===3||RB.m[r][c]===4)); }
function rbTactUsable(u,id){
  const t=RB_TACTS[id];
  if(!t||!(u.tacts[id]>0)) return false;
  if(id==='fire'||t.tgt==='tile') return RB.wx!==2&&[[u.r+1,u.c],[u.r-1,u.c],[u.r,u.c+1],[u.r,u.c-1]].some(([r,c])=>RB.m[r]&&RB.m[r][c]!=null&&[0,1,2].includes(RB.m[r][c])&&!RB.fire[r+','+c]);
  if(id==='volley') return u.type==='bow'&&rbEnemiesInRange(u).length>0;
  if(id==='rocks') return rbAdjHill(u)&&RB.units.some(e=>e.side!==u.side&&e.tr>0&&Math.abs(e.r-u.r)+Math.abs(e.c-u.c)<=1);
  if(t.tgt==='enemy') return RB.units.some(e=>e.side!==u.side&&e.tr>0&&Math.abs(e.r-u.r)+Math.abs(e.c-u.c)<=t.rng);
  return true;   // self 類隨時可用
}
function rbMenuHtml(u,withMove){
  const tg=rbEnemiesInRange(u);
  const adj=RB.units.filter(e=>e.side!==u.side&&e.tr>0&&Math.abs(e.r-u.r)+Math.abs(e.c-u.c)===1);
  const anyTact=Object.keys(u.tacts).some(id=>rbTactUsable(u,id));
  return (withMove?`<button data-a="move">🚶 移動</button>`:'')+
    `<button data-a="atk" ${tg.length?'':'disabled'}>⚔ 攻擊</button>`+
    `<button data-a="duel" ${(adj.length&&!u.dueled)?'':'disabled'}>🗡 單挑</button>`+
    `<button data-a="tact" ${anyTact?'':'disabled'}>📜 策略</button>`+
    `<button data-a="wait">🚩 待機</button>`;
}
function rbBindMenu(u,menu){
  menu.querySelectorAll('button').forEach(b=>b.onclick=(e)=>{
    e.stopPropagation(); menu.style.display='none';
    const a=b.dataset.a;
    if(a==='move'){ RB.mvRange=rbReach(u); RB.mode='move'; RB.sel=u; rbMsg(`${u.g.n}隊：點選要移動的格子`); }
    else if(a==='atk'){ RB.mode='atk'; RB.sel=u; rbMsg(`${u.g.n}隊：點選要攻擊的敵隊`); }
    else if(a==='duel'){ RB.mode='duel'; RB.sel=u; rbMsg(`${u.g.n}：點選要挑戰的相鄰敵將`); }
    else if(a==='tact'){ rbTactMenu(u,parseFloat(menu.style.left),parseFloat(menu.style.top)); }
    else { u.done=true; RB.sel=null; RB.mvRange=null; rbAfterAct(); }
  });
}
function rbShowMenu(u,px,py){
  const menu=$('#rtkMenu');
  menu.innerHTML=rbMenuHtml(u,true);
  menu.style.display='flex'; menu.style.left=Math.min(px,innerWidth-130)+'px'; menu.style.top=Math.min(py,innerHeight-200)+'px';
  rbBindMenu(u,menu);
}
/* 策略子選單：列出該武將會的策略（含習得），附剩餘次數 */
function rbTactMenu(u,px,py){
  const menu=$('#rtkMenu');
  menu.innerHTML=Object.keys(u.tacts).map(id=>{
    const t=RB_TACTS[id], ok=rbTactUsable(u,id);
    return `<button data-t="${id}" ${ok?'':'disabled'} title="${t.desc}">${t.icon} ${t.n}<span style="opacity:.7;font-size:11px">×${u.tacts[id]}</span></button>`;
  }).join('')+`<button data-t="__back">↩ 返回</button>`;
  menu.style.display='flex'; menu.style.left=Math.min(px,innerWidth-150)+'px'; menu.style.top=Math.min(py,innerHeight-260)+'px';
  menu.querySelectorAll('button').forEach(b=>b.onclick=(e)=>{
    e.stopPropagation(); menu.style.display='none';
    const id=b.dataset.t;
    if(id==='__back'){ rbShowMenu(u,px,py); return; }
    const t=RB_TACTS[id];
    if(t.tgt==='self'){ rbUseTact(u,id,null); return; }
    if(id==='fire'){ RB.mode='fire'; RB.sel=u; rbMsg(`${u.g.n}隊【火計】：點選要放火的相鄰格`); return; }
    if(t.tgt==='tile'){ RB.mode='tact:'+id; RB.sel=u; rbMsg(`${u.g.n}隊【${t.n}】：點選要放火的相鄰格`); return; }
    RB.mode='tact:'+id; RB.sel=u; rbMsg(`${u.g.n}隊【${t.n}】：點選目標敵隊（${t.rng}格內）`);
  });
}
/* 執行策略效果 */
function rbUseTact(u,id,e){
  const t=RB_TACTS[id];
  u.tacts[id]--;
  const resist=e?Math.max(0.15,Math.min(0.9,0.55+(u.g.int-e.g.int)/120)):1;
  const fin=()=>{ u.done=true; RB.sel=null; RB.mode=null; rbRefreshTop(); if(!rbCheckEnd())rbAfterAct(); };
  switch(id){
    case 'ambush':
      if(Math.random()<resist){ const d=Math.floor(e.tr*0.15); e.tr-=d; e.done=true; e.mor=Math.max(5,e.mor-8); rbFx(e.r,e.c,'🌿','-'+fmt(d),'#8ae86a');
        rbMsg(`🌿 ${u.g.n} 伏兵奇襲得手！${e.g.n}隊折兵 ${fmt(d)}、陣腳大亂本日不能動`); }
      else rbMsg(`${u.g.n} 伏兵被 ${e.g.n} 識破……`);
      fin(); break;
    case 'chaos':
      if(Math.random()<resist){ e.done=true; e.stun=false; e.mor=Math.max(5,e.mor-16); rbFx(e.r,e.c,'😵','士氣-16','#c8a8ff');
        rbMsg(`😵 ${u.g.n} 計亂敵心！${e.g.n}隊自相驚擾，本日不能動`); }
      else rbMsg(`${e.g.n} 不為所動，${u.g.n} 之計未成`);
      fin(); break;
    case 'taunt':
      if(Math.random()<0.85){ e.mor=Math.max(5,e.mor-12); rbFx(e.r,e.c,'🗯️','士氣-12','#ffd080'); rbMsg(`🗯️ ${u.g.n} 陣前叫罵，${e.g.n}隊士氣 -12！`); }
      else rbMsg(`${e.g.n}隊充耳不聞`);
      fin(); break;
    case 'rally':{
      let n=0; u.mor=Math.min(100,u.mor+14); rbFx(u.r,u.c,'🥁','士氣+14','#8ae8c0');
      RB.units.forEach(a=>{ if(a!==u&&a.side===u.side&&a.tr>0&&Math.abs(a.r-u.r)+Math.abs(a.c-u.c)<=1){ a.mor=Math.min(100,a.mor+14); n++; } });
      rbMsg(`🥁 ${u.g.n} 親擂戰鼓，${n?`${n} 支友軍與`:''}本隊士氣大振！`); fin(); break; }
    case 'charge':
      u.mor=Math.max(5,u.mor-5); rbFx(u.r,u.c,'🐎','突擊！','#ffb060');
      rbAttack(u,e,fin,{mul:1.5}); rbMsg(`🐎 ${u.g.n} 捨身突擊！`); break;
    case 'wall':
      u.guard=true; rbFx(u.r,u.c,'🛡️','堅陣','#a8d8ff'); rbMsg(`🛡️ ${u.g.n} 布下堅壁之陣，受傷減半至明日`); fin(); break;
    case 'volley':
      rbAttack(u,e,()=>{ if(e.tr>0){ rbMsg(`🏹 ${u.g.n} 連弩再射！`); rbAttack(u,e,fin,{mul:0.7}); } else fin(); }); break;
    case 'rocks':
      if(Math.random()<0.75){ const d=Math.floor(e.tr*0.18); e.tr-=d; e.mor=Math.max(5,e.mor-8); rbFx(e.r,e.c,'🪨','-'+fmt(d),'#e0c890');
        rbMsg(`🪨 ${u.g.n} 居高落石！${e.g.n}隊折兵 ${fmt(d)}`); if(e.tr<=0){e.tr=0;rbMsg(`💥 ${e.g.n}隊潰滅！`);} }
      else rbMsg(`${u.g.n} 落石未能命中`);
      fin(); break;
    case 'heal':{
      const d=Math.floor(u.tr*0.06); u.tr+=d; u.mor=Math.min(100,u.mor+5); rbFx(u.r,u.c,'🌾','+'+fmt(d),'#a8e88a');
      rbMsg(`🌾 ${u.g.n} 收攏散卒，恢復兵力 ${fmt(d)}`); fin(); break; }
    /* ── 名將專屬戰法 ── */
    case 'h_lvbu':
      rbFx(u.r,u.c,'⚡','無雙','#ffd040'); rbAttack(u,e,fin,{mul:2.2}); rbMsg(`⚡ ${u.g.n} 鬼神之擊！`); break;
    case 'h_guanyu': case 'h_sunce':
      e.mor=Math.max(5,e.mor-14); rbFx(u.r,u.c,RB_TACTS[id].icon,RB_TACTS[id].n,'#8ae86a');
      rbAttack(u,e,fin,{mul:1.8}); rbMsg(`${RB_TACTS[id].icon} ${u.g.n}【${RB_TACTS[id].n}】！`); break;
    case 'h_zhangfei':{
      let n=0;
      RB.units.forEach(x=>{ if(x.side!==u.side&&x.tr>0&&Math.abs(x.r-u.r)+Math.abs(x.c-u.c)<=2){
        x.mor=Math.max(5,x.mor-18); if(Math.random()<0.35){x.done=true;} n++; rbFx(x.r,x.c,'📣','士氣-18','#ffd080'); } });
      rbMsg(`📣 ${u.g.n} 一聲怒吼如雷貫耳，${n} 支敵隊膽寒${n?'（部分嚇止不能動）':''}！`); fin(); break; }
    case 'h_zhaoyun': case 'h_huangzhong':{
      const d=Math.max(80,Math.floor(e.tr*(id==='h_huangzhong'?0.16:0.14)*(1+u.g.war/200)*rnd(0.9,1.15)));
      e.tr-=d; e.mor=Math.max(5,e.mor-12);
      rbFx(e.r,e.c,RB_TACTS[id].icon,'-'+fmt(d),'#ff7a5a');
      rbMsg(`${RB_TACTS[id].icon} ${u.g.n}【${RB_TACTS[id].n}】命中要害，敵折 ${fmt(d)}（無反擊）`);
      if(e.tr<=0){e.tr=0;rbMsg(`💥 ${e.g.n}隊潰滅！`);} fin(); break; }
    case 'h_machao':
      rbFx(u.r,u.c,'🏇','神速！','#ffe080');
      rbMsg(`🏇 ${u.g.n} 西涼鐵騎神速再動！（本隊可再行動一次）`);
      u.done=false; RB.sel=null; RB.mode=null; rbRefreshTop(); break;   // 不設 done
    case 'h_zhouyu': case 'h_luxun':{
      const [,wdx,wdy]=RB_WIND[RB.wind];
      let rr=e.r, cc=e.c, lit=0;
      for(let i=0;i<3;i++){ if(RB.m[rr]&&RB.m[rr][cc]!=null&&[0,1,2].includes(RB.m[rr][cc])){ RB.fire[rr+','+cc]=3; lit++; rbFx(rr,cc,'🔥','','#ff9040'); } rr+=wdy; cc+=wdx; }
      rbMsg(`🌋 ${u.g.n}【${RB_TACTS[id].n}】！烈焰順${RB_WIND[RB.wind][0]}風連燒 ${lit} 格`); fin(); break; }
    case 'h_kongming':{
      RB.units.forEach(x=>{ if(x.side===u.side&&x.tr>0)x.guard=true; });
      rbFx(u.r,u.c,'☯','八陣圖','#c8e8ff');
      rbMsg(`☯ ${u.g.n} 排下八陣圖，我軍全體本日受傷減半！`); fin(); break; }
    case 'h_sima':
      if(Math.random()<Math.max(0.3,resist)){ e.done=true; e.mor=Math.max(5,e.mor-25); rbFx(e.r,e.c,'🌑','攻心','#c8a8ff');
        rbMsg(`🌑 ${u.g.n} 攻心之計！${e.g.n}隊士氣崩落、本日不能動`); }
      else rbMsg(`${e.g.n} 識破了 ${u.g.n} 的深謀……`);
      fin(); break;
    case 'h_caocao':{
      e.mor=Math.max(5,e.mor-20);
      RB.units.forEach(x=>{ if(x.side===u.side&&x.tr>0)x.mor=Math.min(100,x.mor+8); });
      rbFx(e.r,e.c,'👑','威壓-20','#ffd080');
      rbMsg(`👑 ${u.g.n} 揮鞭立馬，敵膽俱裂、我軍振奮！`); fin(); break; }
    case 'h_liubei':{
      let d0=0;
      RB.units.forEach(x=>{ if(x.side===u.side&&x.tr>0){ x.mor=Math.min(100,x.mor+15); const d=Math.floor(x.tr*0.03); x.tr+=d; d0+=d; } });
      rbFx(u.r,u.c,'🕊️','仁德','#a8e88a');
      rbMsg(`🕊️ ${u.g.n} 仁德感召，全軍士氣大振、歸兵 ${fmt(d0)}`); fin(); break; }
    case 'h_ganning':{
      const d=Math.max(100,Math.floor(e.tr*0.12*rnd(0.9,1.2)));
      e.tr-=d; e.mor=Math.max(5,e.mor-15);
      rbFx(e.r,e.c,'🌙','-'+fmt(d),'#a8c8ff');
      rbMsg(`🌙 ${u.g.n} 百騎劫營！${e.g.n}隊夜驚折兵 ${fmt(d)}`);
      if(e.tr<=0){e.tr=0;rbMsg(`💥 ${e.g.n}隊潰滅！`);} fin(); break; }
    case 'h_xuchu':
      u.guard=true; u.guard70=true; rbFx(u.r,u.c,'🐅','虎痴','#ffe0a0');
      rbMsg(`🐅 ${u.g.n} 裸衣挺立如鐵壁，本日受傷 -70%！`); fin(); break;
    case 'sky':{
      RB.wx=RB.wx===2?0:2;   // 晴雨逆轉（陰視同轉雨）
      rbFx(u.r,u.c,'🌩️',RB.wx===2?'天降大雨':'雨過天晴','#a8d8ff');
      rbMsg(`🌩️ ${u.g.n} 登壇作法，${RB.wx===2?'霎時烏雲密布、大雨傾盆（火計失效、火勢將熄）':'雨霽天晴，火攻可行！'}`);
      rbRefreshTop(); fin(); break; }
    case 'wind':{
      const menu=$('#rtkMenu');
      menu.innerHTML=RB_WIND.map((w,i)=>`<button data-w="${i}">🌀 ${w[0]}風</button>`).join('');
      menu.style.display='flex';
      menu.querySelectorAll('button').forEach(b=>b.onclick=(ev)=>{
        ev.stopPropagation(); menu.style.display='none';
        RB.wind=+b.dataset.w;
        rbFx(u.r,u.c,'🌀',RB_WIND[RB.wind][0]+'風起','#a8f0e0');
        rbMsg(`🌀 ${u.g.n} 借得${RB_WIND[RB.wind][0]}風！火勢將順風而行`);
        rbRefreshTop(); fin();
      });
      return; }   // fin 由風向選單觸發
    default: fin();
  }
}
function rbAfterAct(){
  if(rbCheckEnd()) return;
  const mine=rbAlive(rbPlayerSide());
  if(mine.every(u=>u.done)){ $('#rtkMenu').style.display='none'; RB.sel=null; RB.mvRange=null; rbAiTurn(); }
}
$('#rtkCv').addEventListener('click',ev=>{
  if(!RB||RB.phase!=='player') return;
  const {r,c}=rbCanvasPos(ev);
  if(!RB.m[r]||RB.m[r][c]==null) return;
  const uHere=RB.units.find(u=>u.tr>0&&u.r===r&&u.c===c);
  const my=rbPlayerSide();
  if(RB.mode==='move'&&RB.sel){
    const u=RB.sel;
    if(uHere===u){   // 再點自己＝原地下令（不移動）
      u._from=null; RB.mvRange=null; RB.mode=null;
      rbShowMenu2(u,ev.clientX,ev.clientY); return;
    }
    if(RB.mvRange&&RB.mvRange[r+','+c]!=null&&!uHere){
      u._from={r:u.r,c:u.c};   // 記原位，選單可取消回退
      u.r=r; u.c=c; u.moved=true;   // 本回合已移動（防重複移動）
      RB.mvRange=null; RB.mode=null;
      rbShowMenu2(u,ev.clientX,ev.clientY); return;
    }
    // 點無效處＝取消移動模式
    RB.sel=null; RB.mode=null; RB.mvRange=null; $('#rtkMenu').style.display='none';
    rbMsg('已取消'); return;
  }
  const backToMenu=(u)=>{ RB.mode=null; rbMsg('已取消，請重新選擇指令'); rbShowMenu2(u,ev.clientX+8,ev.clientY+8); };
  if(RB.mode==='atk'&&RB.sel){
    if(uHere&&uHere.side!==my&&(Math.abs(uHere.r-RB.sel.r)+Math.abs(uHere.c-RB.sel.c))<=RB.sel.rng){
      const u=RB.sel; RB.sel=null; RB.mode=null; rbAttack(u,uHere,()=>rbAfterAct());
    } else backToMenu(RB.sel);   // 點錯/想取消 → 回上一個選單
    return;
  }
  if(RB.mode==='fire'&&RB.sel){
    if(Math.abs(r-RB.sel.r)+Math.abs(c-RB.sel.c)===1&&[0,1,2].includes(RB.m[r][c])){
      const u=RB.sel; RB.sel=null; RB.mode=null; rbFireAttack(u,r,c); rbAfterAct();
    } else backToMenu(RB.sel);
    return;
  }
  if(RB.mode==='duel'&&RB.sel){
    if(uHere&&uHere.side!==my&&Math.abs(uHere.r-RB.sel.r)+Math.abs(uHere.c-RB.sel.c)===1){
      const u=RB.sel; RB.sel=null; RB.mode=null; rbChallenge(u,uHere);
    } else backToMenu(RB.sel);
    return;
  }
  if(RB.mode&&RB.mode.startsWith('tact:')&&RB.sel){
    const id=RB.mode.slice(5), t=RB_TACTS[id];
    if(t.tgt==='tile'){
      if(Math.abs(r-RB.sel.r)+Math.abs(c-RB.sel.c)===1&&[0,1,2].includes(RB.m[r][c])){
        const u=RB.sel; RB.sel=null; RB.mode=null; rbUseTact(u,id,{r,c,tile:true});
      } else backToMenu(RB.sel);
      return;
    }
    if(uHere&&uHere.side!==my&&(Math.abs(uHere.r-RB.sel.r)+Math.abs(uHere.c-RB.sel.c))<=t.rng){
      const u=RB.sel; RB.sel=null; RB.mode=null; rbUseTact(u,id,uHere);
    } else backToMenu(RB.sel);
    return;
  }
  // 選取自己的未行動部隊 → 預設進移動模式（再點同隊＝原地下令；點空處＝取消）
  if(uHere&&uHere.side===my&&!uHere.done){
    if(uHere.moved){   // 本回合已移動過：只能下令，不能再移
      RB.sel=uHere; RB.mode=null; RB.mvRange=null;
      rbShowMenu2(uHere,ev.clientX+8,ev.clientY+8);
    } else {
      RB.sel=uHere; RB.mode='move'; RB.mvRange=rbReach(uHere);
      rbMsg(`${uHere.g.n}隊：點格子移動／再點本隊原地下令／點其他處取消`);
    }
  }
  else if(uHere&&uHere.side!==my){ rbMsg(`${uHere.g.n}隊：兵${fmt(uHere.tr)} 士氣${uHere.mor}（${RB_TNAME[RB.m[r][c]]||'平地'}）`);
    if(typeof showGenCard==='function')showGenCard(uHere.g); }   // 敵將詳細資料
  else if(uHere&&uHere.done){ rbMsg(`${uHere.g.n}隊 本日已行動完畢`); }
  else { RB.sel=null; RB.mode=null; RB.mvRange=null; $('#rtkMenu').style.display='none';
    rbMsg(`（${RB_TNAME[RB.m[r][c]]||'平地'}）點部隊下指令；金框＝可行動`); }
});
function rbShowMenu2(u,px,py){   // 移動後：攻擊/單挑/策略/待機/取消(回原位)
  const menu=$('#rtkMenu');
  menu.innerHTML=rbMenuHtml(u,false)+`<button data-a="cancel">✖ 取消</button>`;
  menu.style.display='flex'; menu.style.left=Math.min(px,innerWidth-130)+'px'; menu.style.top=Math.min(py,innerHeight-230)+'px';
  rbBindMenu(u,menu);
  menu.querySelector('button[data-a="cancel"]').onclick=(e)=>{
    e.stopPropagation(); menu.style.display='none';
    if(u._from){ u.r=u._from.r; u.c=u._from.c; u._from=null; }   // 退回原位、不消耗行動
    u.moved=false;   // 可重新移動
    RB.sel=null; RB.mode=null; RB.mvRange=null;
    rbMsg('已取消（部隊退回原位，仍可行動）');
  };
}
$('#rtkEndTurn').onclick=()=>{ if(!RB||RB.phase!=='player')return; rbAlive(rbPlayerSide()).forEach(u=>u.done=true); $('#rtkMenu').style.display='none'; RB.sel=null; RB.mvRange=null; rbAiTurn(); };
$('#rtkRetreat').onclick=()=>{ if(!RB||RB.phase!=='player')return;
  if(confirm('確定要撤退嗎？（以現存兵力退回）')) rbFinish('def','我軍鳴金收兵，全師而退。'); };
$('#rtkAuto').onclick=()=>{ if(!RB||RB.phase!=='player')return;
  if(!confirm('把戰事委任軍師自動指揮嗎？'))return;
  const aLeftNow=rbAlive(0).reduce((s,u)=>s+u.tr,0), dLeftNow=rbAlive(1).reduce((s,u)=>s+u.tr,0);
  const res=simulateBattle(
    {fid:RB.aFid,tr:aLeftNow,gens:rbAlive(0).map(u=>u.g),morale:Math.round(rbAlive(0).reduce((s,u)=>s+u.mor,0)/Math.max(1,rbAlive(0).length))},
    {fid:RB.dFid,tr:dLeftNow,gens:rbAlive(1).map(u=>u.g),morale:Math.round(rbAlive(1).reduce((s,u)=>s+u.mor,0)/Math.max(1,rbAlive(1).length))},
    RB.city);
  rbClose(res); };
$('#rtkInfoBtn').onclick=()=>{
  if(!RB)return;
  const info=$('#rtkInfo');
  if(info.classList.contains('on')){ info.classList.remove('on'); return; }
  const row=u=>`<tr><td style="color:${fColor(u.side===0?RB.aFid:RB.dFid)}">${u.g.n}</td><td>${u.side===0?'攻':'守'}</td><td>${{cav:'騎兵',inf:'步兵',bow:'弩兵'}[u.type]}</td><td>${fmt(u.tr)}</td><td>${u.mor}</td><td>${u.g.war}/${u.g.ldr}/${u.g.int}</td><td style="text-align:left">${Object.keys(u.tacts).map(id=>RB_TACTS[id].icon+RB_TACTS[id].n+'×'+u.tacts[id]).join(' ')||'—'}</td></tr>`;
  info.innerHTML=`<h3>兩軍情報（${RB.day}日目）</h3><table><tr><th>武將</th><th>方</th><th>兵種</th><th>兵力</th><th>士氣</th><th>武/統/智</th><th>策略</th></tr>${RB.units.filter(u=>u.tr>0).map(row).join('')}</table><div style="text-align:center;margin-top:10px"><button onclick="$('#rtkInfo').classList.remove('on')" style="background:#2c421e;border:1px solid #8aa860;color:#ffe9a8;border-radius:6px;padding:5px 22px;cursor:pointer;font-family:inherit">關閉</button></div>`;
  info.classList.add('on');
};

/* ---- 繪製（像素風，48px 格、依地域配色） ---- */
function rbDrawTile(x,r,c,t,ctx){
  const y=r*RB_T, xx=c*RB_T, k=RB_T/48;
  const P=RB_PAL[RB.region]||RB_PAL.plain;
  const base={0:P.g1,1:P.g2,2:P.g2,3:'#8a7a4a',4:'#6a5c42',5:'#3a6a9a',8:P.g2,9:'#4a4038'};
  ctx.fillStyle=base[t]||P.g1; ctx.fillRect(xx,y,RB_T,RB_T);
  if((r+c)%2===0){ ctx.fillStyle='rgba(0,0,0,.06)'; ctx.fillRect(xx,y,RB_T,RB_T); }
  // 細草點
  if(t<=1){ ctx.fillStyle='rgba(255,255,255,.07)';
    ctx.fillRect(xx+((r*13+c*7)%(RB_T-6)),y+((r*5+c*11)%(RB_T-6)),3,3); ctx.fillRect(xx+((r*23+c*17)%(RB_T-6)),y+((r*29+c*3)%(RB_T-6)),3,3); }
  if(t===2){ // 林（多棵樹、地域樹色）
    const tr=(dx,dy,s)=>{ dx*=k; dy*=k; s*=k; ctx.fillStyle='#3a2a16'; ctx.fillRect(xx+dx-1,y+dy,3*k,6*k);
      ctx.fillStyle=P.tree; ctx.beginPath(); ctx.arc(xx+dx,y+dy-3*k,s,0,7); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.15)'; ctx.beginPath(); ctx.arc(xx+dx-2*k,y+dy-5*k,s*0.45,0,7); ctx.fill(); };
    tr(12,26,7); tr(30,17,8); tr(36,34,6); tr(18,40,6);
  }
  if(t===3){ ctx.fillStyle='#9a8a58'; ctx.beginPath(); ctx.moveTo(xx+6*k,y+38*k); ctx.lineTo(xx+24*k,y+12*k); ctx.lineTo(xx+42*k,y+38*k); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#7a6a42'; ctx.beginPath(); ctx.moveTo(xx+24*k,y+12*k); ctx.lineTo(xx+42*k,y+38*k); ctx.lineTo(xx+24*k,y+38*k); ctx.closePath(); ctx.fill(); }
  if(t===4){ ctx.fillStyle='#8a7a62'; ctx.beginPath(); ctx.moveTo(xx+4*k,y+43*k); ctx.lineTo(xx+24*k,y+5*k); ctx.lineTo(xx+44*k,y+43*k); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#6a5a46'; ctx.beginPath(); ctx.moveTo(xx+24*k,y+5*k); ctx.lineTo(xx+44*k,y+43*k); ctx.lineTo(xx+24*k,y+43*k); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.moveTo(xx+18*k,y+16*k); ctx.lineTo(xx+24*k,y+5*k); ctx.lineTo(xx+30*k,y+16*k); ctx.closePath(); ctx.fill(); }
  if(t===5){ ctx.fillStyle='rgba(255,255,255,.25)';
    ctx.fillRect(xx+6*k,y+14*k+((r*7+c*3)%8),12*k,3); ctx.fillRect(xx+26*k,y+32*k-((r*3+c*5)%6),13*k,3); }
  if(t===8){ ctx.strokeStyle='#3a2a12'; ctx.lineWidth=3*k; ctx.strokeRect(xx+9*k,y+9*k,RB_T-18*k,RB_T-18*k);
    ctx.fillStyle='#c8a858'; ctx.fillRect(xx+13*k,y+13*k,RB_T-26*k,RB_T-26*k);
    ctx.fillStyle='#7a2a1a'; ctx.font=`bold ${Math.round(18*k)}px serif`; ctx.textAlign='center'; ctx.fillText('陣',xx+RB_T/2,y+RB_T/2+7*k); }
}
function rbDrawCamp(ctx,camp,fid){
  const xx=camp.c*RB_T, y=camp.r*RB_T, k=RB_T/48;
  ctx.fillStyle='#5a3a1c'; ctx.fillRect(xx+4*k,y+4*k,RB_T-8*k,RB_T-8*k);
  ctx.strokeStyle=fColor(fid); ctx.lineWidth=4*k; ctx.strokeRect(xx+4*k,y+4*k,RB_T-8*k,RB_T-8*k);
  ctx.fillStyle='#ffe9a8'; ctx.font=`bold ${Math.round(15*k)}px serif`; ctx.textAlign='center';
  ctx.fillText('本',xx+RB_T/2,y+RB_T/2-1); ctx.fillText('陣',xx+RB_T/2,y+RB_T-8*k);
}
function rbLoop(){
  if(!RB) return;
  const cv=$('#rtkCv'), ctx=cv.getContext('2d');
  ctx.setTransform(2,0,0,2,0,0);   // 2×超取樣
  const t=performance.now()/1000;
  for(let r=0;r<RB_ROWS;r++)for(let c=0;c<RB_COLS;c++) rbDrawTile(0,r,c,RB.m[r][c],ctx);
  rbDrawCamp(ctx,RB.aCamp,RB.aFid); rbDrawCamp(ctx,RB.dCamp,RB.dFid);
  // 移動範圍
  if(RB.mvRange){ ctx.fillStyle='rgba(120,200,255,.32)';
    Object.keys(RB.mvRange).forEach(k=>{ const [r,c]=k.split(',').map(Number); ctx.fillRect(c*RB_T,r*RB_T,RB_T,RB_T); }); }
  // 攻擊模式高亮敵隊
  if(RB.mode==='atk'&&RB.sel){ ctx.strokeStyle='rgba(255,80,60,.9)'; ctx.lineWidth=2;
    rbEnemiesInRange(RB.sel).forEach(e=>ctx.strokeRect(e.c*RB_T+2,e.r*RB_T+2,RB_T-4,RB_T-4)); }
  // 火
  Object.keys(RB.fire).forEach(k=>{ const [r,c]=k.split(',').map(Number);
    const xx=c*RB_T, y=r*RB_T, fl=Math.sin(t*9+r+c)*3;
    ctx.fillStyle='rgba(230,80,20,.85)'; ctx.beginPath();
    ctx.moveTo(xx+7,y+RB_T-5); ctx.quadraticCurveTo(xx+RB_T/2,y+2+fl,xx+RB_T-7,y+RB_T-5); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,200,60,.9)'; ctx.beginPath();
    ctx.moveTo(xx+12,y+RB_T-6); ctx.quadraticCurveTo(xx+RB_T/2,y+12-fl,xx+RB_T-12,y+RB_T-6); ctx.closePath(); ctx.fill(); });
  // 部隊（比例棋子：底座＋小兵×3＋大軍旗姓字＋名條兵力）；k=尺寸比例
  const mySide=rbPlayerSide();
  const k=RB_T/48;
  RB.units.forEach(u=>{
    if(u.tr<=0) return;
    const xx=u.c*RB_T, y=u.r*RB_T, fid=u.side===0?RB.aFid:RB.dFid;
    const col=u.done?'#8a8a8a':fColor(fid);
    // 我方未行動：底光提示（讓玩家知道可點）
    if(RB.phase==='player'&&u.side===mySide&&!u.done&&RB.sel!==u){
      ctx.fillStyle=`rgba(255,240,150,${0.16+Math.sin(t*3+u.c)*0.08})`; ctx.fillRect(xx,y,RB_T,RB_T);
    }
    // 底座橢圓陰影
    ctx.fillStyle='rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(xx+RB_T/2,y+RB_T-11*k,16*k,5*k,0,0,7); ctx.fill();
    // 小兵×3
    [[10,24],[21,29],[32,24]].forEach(([dx,dy])=>{
      dx*=k; dy*=k;
      ctx.fillStyle=col; ctx.fillRect(xx+dx,y+dy,8*k,12*k);                 // 身
      ctx.fillStyle='#e8c8a0'; ctx.fillRect(xx+dx+1*k,y+dy-6*k,6*k,6*k);    // 頭
      ctx.fillStyle='#3a2a16'; ctx.fillRect(xx+dx+1*k,y+dy-8*k,6*k,3*k);    // 盔
      ctx.fillStyle='#c8b890'; ctx.fillRect(xx+dx+8*k,y+dy-8*k,2*k,14*k);   // 矛
    });
    // 大軍旗（姓字）
    ctx.strokeStyle='#3a2a12'; ctx.lineWidth=3*k; ctx.beginPath(); ctx.moveTo(xx+38*k,y+30*k); ctx.lineTo(xx+38*k,y+3*k); ctx.stroke();
    ctx.fillStyle=col; ctx.fillRect(xx+38*k,y+3*k,-20*k,15*k);
    ctx.strokeStyle='rgba(0,0,0,.5)'; ctx.lineWidth=1; ctx.strokeRect(xx+18*k,y+3*k,20*k,15*k);
    ctx.font=`bold ${Math.round(13*k)}px serif`; ctx.textAlign='center';
    ctx.lineWidth=2; ctx.strokeStyle='rgba(0,0,0,.7)'; ctx.strokeText(u.g.n[0],xx+28*k,y+15*k);
    ctx.fillStyle='#fff'; ctx.fillText(u.g.n[0],xx+28*k,y+15*k);
    // 名條：武將名＋兵種＋兵力
    ctx.fillStyle=u.side===mySide?'rgba(10,40,10,.78)':'rgba(50,8,8,.78)';
    ctx.fillRect(xx+1,y+RB_T-12*k,RB_T-2,11*k);
    ctx.font=`bold ${Math.max(9,Math.round(10*k))}px sans-serif`;
    const nm=u.g.n.length>3?u.g.n.slice(0,3):u.g.n;
    const label=nm+' '+({cav:'騎',inf:'步',bow:'弩'})[u.type]+(u.tr>=10000?Math.round(u.tr/1000)+'千':u.tr);
    ctx.lineWidth=2.5; ctx.strokeStyle='rgba(0,0,0,.85)'; ctx.strokeText(label,xx+RB_T/2,y+RB_T-3.5*k);
    ctx.fillStyle='#ffedb0'; ctx.fillText(label,xx+RB_T/2,y+RB_T-3.5*k);
    // 堅陣標記
    if(u.guard){ ctx.fillStyle='#cfe8ff'; ctx.font=`${Math.round(12*k)}px sans-serif`; ctx.fillText('🛡',xx+8*k,y+14*k); }
    // 選取框
    if(RB.sel===u){ ctx.strokeStyle=`rgba(255,255,255,${0.55+Math.sin(t*6)*0.4})`; ctx.lineWidth=3; ctx.strokeRect(xx+2,y+2,RB_T-4,RB_T-4); }
  });
  // 戰場特效（icon 彈出＋數字上飄，1 秒）
  if(RB.efx&&RB.efx.length){
    const now=performance.now();
    RB.efx=RB.efx.filter(f=>now-f.t0<1000);
    RB.efx.forEach(f=>{
      const age=(now-f.t0)/1000, cx=f.c*RB_T+RB_T/2, cy=f.r*RB_T+RB_T/2;
      ctx.globalAlpha=age<0.15?age/0.15:(1-age)*1.18;
      if(f.icon){ const s=age<0.25?(20+age*160):(60-age*18);
        ctx.font=`${Math.round(s*RB_T/48)}px sans-serif`; ctx.textAlign='center'; ctx.fillText(f.icon,cx,cy-age*22); }
      if(f.txt){ ctx.font=`bold ${Math.round(15*RB_T/48+4)}px sans-serif`;
        ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.8)'; ctx.strokeText(f.txt,cx,cy-14-age*30);
        ctx.fillStyle=f.color; ctx.fillText(f.txt,cx,cy-14-age*30); }
      ctx.globalAlpha=1;
    });
  }
  // 風向標（右上角）：箭頭指風去向
  (function(){
    const bx=(RB_COLS-3)*RB_T+6, by=8, [wn,dx,dy]=RB_WIND[RB.wind];
    ctx.fillStyle='rgba(20,30,12,.75)'; ctx.fillRect(bx,by,RB_T*3-12,30);
    ctx.strokeStyle='#8aa860'; ctx.lineWidth=1.5; ctx.strokeRect(bx,by,RB_T*3-12,30);
    ctx.fillStyle='#ffe9a8'; ctx.font='bold 13px sans-serif'; ctx.textAlign='left';
    ctx.fillText(`${RB_WX[RB.wx][1]}・${wn}風`,bx+8,by+20);
    const cx=bx+RB_T*3-36, cy=by+15, ang=Math.atan2(dy,dx);
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang);
    ctx.fillStyle='#ffb0a0'; ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-7,-6); ctx.lineTo(-3,0); ctx.lineTo(-7,6); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.textAlign='center';
  })();
  rbRAF=requestAnimationFrame(rbLoop);
}

/* ===== 主遊戲整合：武將卡顯示策略＋事件習得新策略 ===== */
// 武將資料卡：附加「戰場策略」區（派系＋策略清單；事件習得的標☆）
if(typeof showGenCard==='function'){
  const _showGenCard=showGenCard;
  showGenCard=function(g){
    _showGenCard(g);
    try{
      const ids=rbGenTacts(g);
      const html=`<div style="margin-top:8px;padding:8px 10px;background:rgba(80,120,50,.12);border:1px solid rgba(138,168,96,.4);border-radius:8px">`+
        `<div style="font-size:12px;color:#a8c880;font-weight:800;margin-bottom:4px">⚔️ 戰場策略 <span style="opacity:.75">（${rbSchoolName(g)}）</span></div>`+
        ids.map(id=>{const t=RB_TACTS[id];const learned=(g.xTacts||[]).includes(id);
          return `<div style="font-size:12px;line-height:1.6">${t.icon} <b>${t.n}</b>${learned?' <span style="color:#e8c95a">☆習得</span>':''} <span style="opacity:.7">— ${t.desc}</span></div>`;}).join('')+
        `</div>`;
      $('#gmInfo').insertAdjacentHTML('beforeend',html);
    }catch(e){}
  };
}
// 事件：低概率讓麾下武將悟出新策略（w:1＝最低權重）
if(typeof EVENTS!=='undefined'&&Array.isArray(EVENTS)){
  EVENTS.push({id:'learntact',n:'兵法頓悟',icon:'📜',w:1,d:'將領夜讀兵書，忽有所悟，習得新的戰場策略！',
    ap(){
      const mine=state.gens.filter(g=>g.f===state.player&&!g.dead);
      if(!mine.length) return null;
      // 找一個還沒會的策略（能力門檻可略過＝天賦頓悟）
      for(let tries=0;tries<12;tries++){
        const g=mine[ri(0,mine.length-1)];
        const has=rbGenTacts(g);
        const cand=Object.keys(RB_TACTS).filter(id=>!has.includes(id));
        if(cand.length){
          const id=cand[ri(0,cand.length-1)];
          g.xTacts=g.xTacts||[]; g.xTacts.push(id);
          const t=RB_TACTS[id];
          return `${g.n} 習得【${t.icon}${t.n}】！`;
        }
      }
      return null;
    }});
}
