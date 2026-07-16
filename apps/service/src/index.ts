import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createDefaultAgentRuntime } from "@ai-lab/agent-runtime";
import { SubbrainEngine, SubbrainValidationError, seedFixture } from "@ai-lab/subbrain";
import { motherCaseFixture, selfInsightFixture } from "@ai-lab/subbrain/fixtures";
import { SqliteSubbrainStore } from "@ai-lab/subbrain/sqlite";
import { createDefaultWorkspace, createWorkspace } from "@ai-lab/workspace";
import { serve } from "@hono/node-server";
import { type Context, Hono } from "hono";

export function createApp(root?: string): Hono {
  const app = new Hono();
  const workspace = root === undefined ? createDefaultWorkspace() : createWorkspace(root);
  const runtime = createDefaultAgentRuntime();

  registerHealthRoute(app);
  registerAgentRoutes(app, runtime);
  registerSubbrainRoutes(app, workspace.root);
  return app;
}

function registerHealthRoute(app: Hono): void {
  app.get("/health", (context) => context.json({ status: "ok" }));
}

function registerAgentRoutes(
  app: Hono,
  runtime: ReturnType<typeof createDefaultAgentRuntime>,
): void {
  app.post("/agent/hello", async (context) => {
    const body = await context.req.json<{ input?: string }>().catch((): { input?: string } => ({}));
    const result = await runtime.run({ task: "general", input: body.input ?? "hello" });
    return context.json(result);
  });
}

function registerSubbrainRoutes(app: Hono, root: string): void {
  app.get("/subbrain", (context) => context.html(subbrainPage()));
  app.post("/subbrain/seed", (context) => seedSubbrainRoute(context, root));
  app.post("/subbrain/ask", (context) =>
    subbrainJson(context, async () => askSubbrain(root, askBody(await jsonBody(context)))),
  );
  app.post("/subbrain/entries", (context) =>
    subbrainJson(context, async () => addSubbrainEntry(root, entryBody(await jsonBody(context)))),
  );
  app.get("/subbrain/events", (context) => {
    return context.json({ events: listSubbrainEvents(root) });
  });
}

async function seedSubbrainRoute(context: Context, root: string) {
  let body: ReturnType<typeof seedBody>;
  try {
    body = seedBody(await jsonBody(context));
  } catch (error) {
    if (error instanceof SubbrainValidationError) {
      return badRequest(context, error.message);
    }
    throw error;
  }
  const fixture = body.fixture ?? "mother-case";
  if (body.confirmReset !== true) {
    return badRequest(context, "seed requires confirmReset=true");
  }
  if (!knownFixtureName(fixture)) {
    return badRequest(context, "unknown SubBrain fixture");
  }
  return subbrainJson(context, () => {
    seedSubbrain(root, fixture);
    return { status: "ok", fixture };
  });
}

async function askSubbrain(root: string, body: { question: string; referenceDate?: string }) {
  const store = openSubbrainStore(root);
  try {
    const engine = new SubbrainEngine(store);
    return engine.answer(
      await engine.inferQuery(body.question.trim(), body.referenceDate ?? todayDate()),
    );
  } finally {
    store.close();
  }
}

function seedSubbrain(root: string, fixtureName: string): void {
  resetSubbrainDb(root);
  const store = openSubbrainStore(root);
  try {
    for (const fixture of selectedFixtures(fixtureName)) {
      seedFixture(store, fixture);
    }
  } finally {
    store.close();
  }
}

async function addSubbrainEntry(root: string, body: { text: string; recordedAt?: string }) {
  const entry = rawEntryFromBody(body);
  const store = openSubbrainStore(root);
  try {
    return await new SubbrainEngine(store).addEntry(entry);
  } finally {
    store.close();
  }
}

function listSubbrainEvents(root: string) {
  const store = openSubbrainStore(root);
  try {
    return store.listMemoryEvents();
  } finally {
    store.close();
  }
}

function selectedFixtures(name: string) {
  return name === "self-insight"
    ? [selfInsightFixture]
    : name === "all"
      ? [motherCaseFixture, selfInsightFixture]
      : [motherCaseFixture];
}

function knownFixtureName(name: string): boolean {
  return ["mother-case", "self-insight", "all"].includes(name);
}

function todayDate(): string {
  return localDate(new Date());
}

function rawEntryFromBody(body: { text: string; recordedAt?: string }) {
  const recordedAt = body.recordedAt ?? localTimestamp(new Date());
  const text = body.text.trim();
  if (text === "") {
    throw new SubbrainValidationError("raw_entry", [
      { path: "entry.text", message: "Expected non-empty text." },
    ]);
  }
  return {
    id: `entry_${randomUUID()}`,
    text,
    recordedAt,
  };
}

function resetSubbrainDb(root: string): void {
  rmSync(subbrainDbPath(root), { force: true });
}

function openSubbrainStore(root: string): SqliteSubbrainStore {
  mkdirSync(join(root, ".subbrain"), { recursive: true });
  return new SqliteSubbrainStore(subbrainDbPath(root));
}

function subbrainDbPath(root: string): string {
  return join(root, ".subbrain", "demo.sqlite");
}

async function jsonBody(context: Context): Promise<unknown> {
  return context.req.json<unknown>().catch(() => ({}));
}

function askBody(value: unknown): { question: string; referenceDate?: string } {
  const body = bodyRecord(value, "retrieval_query");
  const question = optionalText(body.question, "query.text", "retrieval_query") ?? "";
  const referenceDate = optionalText(body.referenceDate, "query.referenceDate", "retrieval_query");
  return referenceDate === undefined ? { question } : { question, referenceDate };
}

function entryBody(value: unknown): { text: string; recordedAt?: string } {
  const body = bodyRecord(value, "raw_entry");
  const text = optionalText(body.text, "entry.text", "raw_entry") ?? "";
  const recordedAt = optionalText(body.recordedAt, "entry.recordedAt", "raw_entry");
  return recordedAt === undefined ? { text } : { text, recordedAt };
}

function seedBody(value: unknown): { confirmReset?: boolean; fixture?: string } {
  const body = bodyRecord(value, "raw_entry");
  if (body.confirmReset !== undefined && typeof body.confirmReset !== "boolean") {
    throw requestIssue("raw_entry", "seed.confirmReset", "Expected a boolean.");
  }
  const confirmReset = body.confirmReset as boolean | undefined;
  const fixture = optionalText(body.fixture, "seed.fixture", "raw_entry");
  return {
    ...(confirmReset === undefined ? {} : { confirmReset }),
    ...(fixture === undefined ? {} : { fixture }),
  };
}

function bodyRecord(value: unknown, kind: "raw_entry" | "retrieval_query") {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw requestIssue(kind, "body", "Expected a JSON object.");
  }
  return value as Readonly<Record<string, unknown>>;
}

function optionalText(
  value: unknown,
  path: string,
  kind: "raw_entry" | "retrieval_query",
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw requestIssue(kind, path, "Expected text.");
  }
  return value;
}

function requestIssue(
  kind: "raw_entry" | "retrieval_query",
  path: string,
  message: string,
): SubbrainValidationError {
  return new SubbrainValidationError(kind, [{ path, message }]);
}

function localDate(date: Date): string {
  return [date.getFullYear(), padded(date.getMonth() + 1), padded(date.getDate())].join("-");
}

function localTimestamp(date: Date): string {
  const time = [padded(date.getHours()), padded(date.getMinutes()), padded(date.getSeconds())].join(
    ":",
  );
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return `${localDate(date)}T${time}${sign}${padded(Math.floor(Math.abs(offset) / 60))}:${padded(
    Math.abs(offset) % 60,
  )}`;
}

function padded(value: number): string {
  return String(value).padStart(2, "0");
}

async function subbrainJson<T>(context: Context, run: () => Promise<T> | T) {
  try {
    return context.json(await run());
  } catch (error) {
    if (error instanceof SubbrainValidationError) {
      return badRequest(context, error.message);
    }
    throw error;
  }
}

function badRequest(context: Context, message: string) {
  return context.json({ error: message }, 400);
}

function subbrainPage(): string {
  return `<!doctype html>
<html lang="ko">
${subbrainHead()}
${subbrainBody()}
</html>`;
}

function subbrainHead(): string {
  return `<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SubBrain Local Test</title>
<style>${subbrainCss()}</style>
</head>`;
}

function subbrainBody(): string {
  return `<body>
<main>
${subbrainToolbar()}
${subbrainEntryForm()}
${subbrainQuery()}
${subbrainResults()}
</main>
<script>${subbrainScript()}</script>
</body>`;
}

function subbrainToolbar(): string {
  return `<section class="toolbar"><h1>SubBrain</h1><div>
<button data-seed="mother-case">초기화 후 어머니 사례</button>
<button data-seed="self-insight">초기화 후 자기이해</button>
<button data-seed="all">초기화 후 전체</button>
</div></section>`;
}

function subbrainQuery(): string {
  return `<section class="query">
<textarea id="question">열무 가시에 찔린 뒤 왼쪽 검지가 하얘지고 감각이 둔한데 왜 그럴까?</textarea>
<label>기준 날짜 <input id="reference-date" type="date" value="2026-06-27" /></label>
<button id="ask">질문하기</button>
</section>`;
}

function subbrainEntryForm(): string {
  return `<section class="entry-form">
<div class="entry-header"><h2>빠른 기록</h2><button id="save-entry">저장</button></div>
<input id="quick-entry" value="오늘 팀장과 1:1 후 또 방향이 바뀌어서 답답했다." />
<div class="entry-examples">
<button data-entry-example="오늘 팀장과 1:1 후 또 방향이 바뀌어서 답답했다.">업무</button>
<button data-entry-example="오늘 목이 불편하고 피곤해서 집중이 잘 안 됐다.">컨디션</button>
<button data-entry-example="왼쪽 손가락 감각이 둔해서 걱정됐다.">증상</button>
</div>
<div id="entry-preview" class="list empty">저장하면 추출된 기억이 표시됩니다.</div>
</section>`;
}

function subbrainResults(): string {
  return `<section class="status" id="status">이 로컬 데모는 진단이나 결론이 아니라 개인 기록 연결 후보만 보여줍니다.</section>
<section class="result-grid">
<section class="wide"><h2>기록 연결 요약</h2><div id="decision" class="list empty">아직 결과가 없습니다.</div></section>
<section><h2>확인 후보</h2><div id="candidates" class="list empty">아직 결과가 없습니다.</div></section>
<section><h2>근거 기억</h2><div id="evidence" class="list empty">아직 결과가 없습니다.</div></section>
<section><h2>불확실성</h2><div id="uncertainty" class="list empty">아직 결과가 없습니다.</div></section>
<section><h2>다음 확인 질문</h2><div id="questions" class="list empty">아직 결과가 없습니다.</div></section>
<section class="wide"><h2>저장된 기억</h2><div id="memories" class="list empty">아직 결과가 없습니다.</div></section>
</section>`;
}

function subbrainCss(): string {
  return "body{font:15px system-ui;margin:0;background:#f7f7f4;color:#222}main{max-width:1040px;margin:32px auto;padding:0 20px}.toolbar{display:flex;justify-content:space-between;gap:16px;align-items:center}h1{margin:0;font-size:28px}h2{font-size:15px;margin:0}button{border:1px solid #222;background:#222;color:white;padding:9px 12px;border-radius:6px;cursor:pointer}button:hover{background:#444}input,textarea{width:100%;margin:10px 0;padding:12px;font:inherit;border:1px solid #bbb;border-radius:6px;box-sizing:border-box}textarea{min-height:76px}.entry-form,.query{margin-top:18px}.entry-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.entry-examples{display:flex;gap:8px;flex-wrap:wrap}.entry-examples button{background:white;color:#222;border-color:#ccc}.status{margin:16px 0;padding:10px 12px;border:1px solid #d6d0bd;background:#fffaf0;border-radius:6px}.result-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.result-grid>section,.entry-form{background:white;border:1px solid #ddd;border-radius:6px;padding:14px;min-height:180px}.wide{grid-column:1/-1}.item{border-top:1px solid #eee;padding:10px 0}.item:first-child{border-top:0}.summary{font-size:16px;line-height:1.45}.decision{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}.metric{border:1px solid #e3e3df;border-radius:6px;padding:10px;background:#fafafa}.metric strong{display:block;font-size:20px}.meta{color:#666;font-size:13px;margin-top:5px}.reason{color:#3d4a57;font-size:13px;margin-top:7px}.badge{display:inline-block;background:#edf2ff;border:1px solid #cad6ff;border-radius:999px;padding:2px 7px;margin:4px 4px 0 0;font-size:12px}.badge.candidate{background:#eef8f0;border-color:#bedfc7}.badge.forgotten{background:#fff3dc;border-color:#efd092}.score{font-variant-numeric:tabular-nums}.meter{height:6px;background:#ecece8;border-radius:999px;margin-top:8px;overflow:hidden}.meter span{display:block;height:100%;background:#4d7c59}.empty{color:#777}@media(max-width:760px){.toolbar{display:block}.toolbar div{margin-top:12px}.result-grid{grid-template-columns:1fr}.decision{grid-template-columns:1fr}}";
}

function subbrainScript(): string {
  return [
    ...subbrainScriptState(),
    ...subbrainScriptActions(),
    ...subbrainScriptSummaryRenderers(),
    ...subbrainScriptListRenderers(),
    ...subbrainScriptUtilities(),
  ].join("\n");
}

function subbrainScriptState(): string[] {
  return [
    'const examples={"mother-case":"열무 가시에 찔린 뒤 왼쪽 검지가 하얘지고 감각이 둔한데 왜 그럴까?","self-insight":"내가 왜 요즘 이직 생각을 자주 하지?",all:"내가 왜 요즘 이직 생각을 자주 하지?"};',
    'const referenceDates={"mother-case":"2026-06-27","self-insight":"2026-06-27",all:"2026-06-27"};',
    "const $=(id)=>document.querySelector(id);",
    "const status=$('#status');",
    "document.querySelectorAll('[data-seed]').forEach((button)=>button.onclick=async()=>seed(button.dataset.seed));",
    "document.querySelectorAll('[data-entry-example]').forEach((button)=>button.onclick=()=>setEntryText(button.dataset.entryExample));",
    "$('#save-entry').onclick=async()=>saveEntry();",
    "$('#ask').onclick=async()=>askQuestion();",
    "void loadEvents();",
  ];
}

function subbrainScriptActions(): string[] {
  return [
    "async function seed(fixture){if(!confirm('현재 저장된 데모 기억을 지우고 fixture를 다시 불러올까요?'))return;status.textContent='fixture를 불러오는 중입니다.';$('#question').value=examples[fixture];$('#reference-date').value=referenceDates[fixture];const response=await postJson('/subbrain/seed',{fixture,confirmReset:true});const body=await response.json();status.textContent=response.ok?body.fixture+' fixture를 불러왔습니다.':body.error;clearResults();await loadEvents()}",
    "async function saveEntry(){status.textContent='기록을 저장하는 중입니다.';const response=await postJson('/subbrain/entries',{text:entryText()});const body=await response.json();status.textContent=response.ok?'기억으로 저장했습니다. 연결 '+body.links.length+'개를 만들었습니다.':body.error;if(response.ok){renderEntryPreview(body.events);$('#reference-date').value=body.entry.recordedAt.slice(0,10)}await loadEvents()}",
    "async function askQuestion(){status.textContent='관련 기억을 찾는 중입니다.';const question=$('#question').value;const referenceDate=$('#reference-date').value;const response=await postJson('/subbrain/ask',{question,referenceDate});const data=await response.json();if(!response.ok){status.textContent=data.error;return}render(data);await loadEvents()}",
    "async function postJson(url,body){return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}",
    "async function loadEvents(){const response=await fetch('/subbrain/events');renderMemories((await response.json()).events)}",
    "function entryText(){return $('#quick-entry').value.trim()}",
    "function setEntryText(text){$('#quick-entry').value=text}",
    "function clearResults(){for(const id of ['#decision','#candidates','#evidence','#uncertainty','#questions']){$(id).className='list empty';$(id).textContent='질문하면 결과가 표시됩니다.'}}",
    "function render(data){status.textContent=data.answer.summary;renderDecision(data);renderCandidates(data.answer.causalCandidates,data.context.retrievedMemories);renderEvidence(data.answer.evidence,data.context.retrievedMemories);renderList('#uncertainty',data.answer.uncertainty);renderList('#questions',data.answer.suggestedQuestions)}",
  ];
}

function subbrainScriptSummaryRenderers(): string[] {
  return [
    "function renderDecision(data){const memories=data.context.retrievedMemories;const forgotten=memories.filter((memory)=>memory.forgotten).length;const top=memories[0];$('#decision').className='list';$('#decision').innerHTML='<div class=\"summary\">'+escapeHtml(data.answer.summary)+'</div><div class=\"decision\"><div class=\"metric\"><strong>'+data.answer.causalCandidates.length+'</strong><span>원인 후보</span></div><div class=\"metric\"><strong>'+memories.length+'</strong><span>검색 기억</span></div><div class=\"metric\"><strong>'+forgotten+'</strong><span>잊고 있던 기억</span></div></div>'+topMemoryLine(top)}",
    "function topMemoryLine(memory){return memory?'<div class=\"item\"><strong>최상위 근거</strong><div class=\"meta\">'+escapeHtml(memory.event.summary)+'</div>'+scoreLine(memory)+'</div>':''}",
    "function renderCandidates(items,memories){$('#candidates').className='list';$('#candidates').innerHTML=items.map((item)=>{const memory=findMemory(memories,item.eventId);return '<div class=\"item\"><strong>'+escapeHtml(item.label)+'</strong>'+badges(memory,true)+'<div class=\"meta\">'+escapeHtml(item.eventId)+' · '+escapeHtml(item.confidence)+'</div>'+scoreLine(memory)+'<div class=\"reason\">'+escapeHtml(item.rationale)+'</div></div>'}).join('')||'관련 후보가 없습니다.'}",
  ];
}

function subbrainScriptListRenderers(): string[] {
  return [
    "function renderEvidence(items,memories){$('#evidence').className='list';$('#evidence').innerHTML=items.map((item)=>{const memory=findMemory(memories,item.eventId);return '<div class=\"item\"><strong>'+escapeHtml(item.summary)+'</strong>'+badges(memory,false)+'<div class=\"meta\">'+escapeHtml(item.occurredAt)+' · '+escapeHtml(item.eventId)+' · '+escapeHtml(item.sourceEntryId)+'</div>'+scoreLine(memory)+'<div class=\"reason\">매칭 이유: '+escapeHtml(item.reasons.join(', '))+'</div></div>'}).join('')||'근거 기억이 없습니다.'}",
    "function renderEntryPreview(items){$('#entry-preview').className='list';$('#entry-preview').innerHTML=items.map((item)=>'<div class=\"item\"><strong>'+escapeHtml(item.summary)+'</strong>'+eventBadges(item)+'<div class=\"meta\">'+escapeHtml(item.occurredAt)+' · '+escapeHtml(item.id)+'</div><div class=\"reason\">'+eventDetails(item)+'</div></div>').join('')||'추출된 기억이 없습니다.'}",
    "function renderMemories(items){$('#memories').className='list';$('#memories').innerHTML=items.map((item)=>{const memory=normalizeMemory(item);return '<div class=\"item\"><strong>'+escapeHtml(memory.event.summary)+'</strong>'+badges(memory,false)+'<div class=\"meta\">'+escapeHtml(memory.event.occurredAt)+' · '+escapeHtml(memory.event.id)+'</div>'+scoreLine(memory)+'<div class=\"meta\">'+escapeHtml(memory.event.topics.join(', '))+'</div></div>'}).join('')||'저장된 기억이 없습니다.'}",
    "function scoreLine(memory){if(!memory||typeof memory.score!=='number')return '';const width=Math.max(0,Math.min(100,Math.round(memory.score*10)));return '<div class=\"meta score\">점수 '+memory.score.toFixed(1)+'</div><div class=\"meter\"><span style=\"width:'+width+'%\"></span></div><div class=\"reason\">매칭 이유: '+escapeHtml(memory.reasons.join(', ')||'저장된 기억 목록')+'</div>'}",
  ];
}

function subbrainScriptUtilities(): string[] {
  return [
    "function badges(memory,candidate){const marks=[];if(candidate)marks.push('<span class=\"badge candidate\">원인 후보</span>');if(memory?.forgotten)marks.push('<span class=\"badge forgotten\">잊고 있던 기억</span>');return marks.join('')}",
    "function findMemory(memories,eventId){return memories.find((memory)=>memory.event.id===eventId)}",
    "function normalizeMemory(item){return item.event?item:{event:item,score:null,reasons:[],forgotten:false}}",
    "function eventBadges(item){return [...item.topics,...item.emotions].slice(0,4).map((value)=>'<span class=\"badge\">'+escapeHtml(value)+'</span>').join('')}",
    "function eventDetails(item){const attrs=item.attributes.map((attr)=>attr.type+': '+attr.value);const entities=item.entities.map((entity)=>entity.name);return escapeHtml([...attrs,...entities].join(', ')||'추가 단서 없음')}",
    "function renderList(id,items){$(id).className='list';$(id).innerHTML=items.map((item)=>'<div class=\"item\">'+escapeHtml(item)+'</div>').join('')||'표시할 내용이 없습니다.'}",
    "function escapeHtml(value){return String(value).replace(/[&<>\"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[char]))}",
  ];
}

/* v8 ignore next 5 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.AI_LAB_SERVICE_PORT ?? 3000);
  const hostname = process.env.AI_LAB_SERVICE_HOST ?? "127.0.0.1";
  serve({ fetch: createApp().fetch, hostname, port });
  console.log(`ai-lab service listening on http://${hostname}:${port}`);
}
