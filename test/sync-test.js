/*
 * Sync logic tests for Check Mate HD.
 *
 *   node test/sync-test.js
 *
 * No dependencies, no build step. Loads the real enyo-app/source/api/checkmate.js
 * and enyo-app/source/views/main.js under a minimal Enyo shim, with a clock,
 * timers and XHR the test drives by hand -- so an exact request interleaving can
 * be replayed deterministically.
 *
 * Traces A, B and C are the three races that were actually reported: a sync that
 * un-checked a completed task, a delete that didn't take, and multiple deletes
 * between syncs that almost never took. They are written as tests so they stay
 * fixed.
 *
 * This exercises logic only. Enyo's list rendering, panel transitions and touch
 * handling are stubbed, so a passing run is not a substitute for building the
 * app and trying it on a device.
 */
var fs = require('fs');
var path = require('path');

var ROOT = process.argv[2] || path.join(__dirname, '..');

/* ---------- clock ---------- */
var RealDate = Date;
var fakeNow = 1700000000000;
function FakeDate() { return new RealDate(fakeNow); }
FakeDate.now = function () { return fakeNow; };
global.Date = FakeDate;
function advance(ms) { fakeNow += ms; }

/* ---------- timers we control ---------- */
var pendingTimers = [];
global.setTimeout = function (fn, ms) {
    pendingTimers.push({fn: fn, at: fakeNow + (ms || 0)});
    return pendingTimers.length;
};
global.clearTimeout = function () {};
global.window = {
    setTimeout: global.setTimeout,
    clearTimeout: function () {},
    setInterval: function () { return 1; },
    clearInterval: function () {}
};
function runDueTimers() {
    for (var guard = 0; guard < 100; guard++) {
        var due = [];
        var still = [];
        for (var i = 0; i < pendingTimers.length; i++) {
            if (pendingTimers[i].at <= fakeNow) { due.push(pendingTimers[i]); }
            else { still.push(pendingTimers[i]); }
        }
        pendingTimers = still;
        if (!due.length) { return; }
        for (var j = 0; j < due.length; j++) { due[j].fn(); }
    }
}

/* ---------- localStorage ---------- */
var store = {};
global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
};

/* ---------- controllable Ajax ---------- */
var inFlight = [];
function FakeAjax(cfg) {
    this.cfg = cfg;
    this.responders = [];
    this.errorHandlers = [];
    this.xhrResponse = null;
}
FakeAjax.prototype.response = function (fn) { this.responders.push(fn); return this; };
FakeAjax.prototype.error = function (fn) { this.errorHandlers.push(fn); return this; };
FakeAjax.prototype.go = function () { inFlight.push(this); return this; };
FakeAjax.prototype.succeed = function (body) {
    this.xhrResponse = {status: 200, body: JSON.stringify(body)};
    for (var i = 0; i < this.responders.length; i++) { this.responders[i](this, body); }
};
FakeAjax.prototype.fail = function (status, body) {
    this.xhrResponse = {status: status, body: JSON.stringify(body || {error: 'nope'})};
    for (var i = 0; i < this.errorHandlers.length; i++) { this.errorHandlers[i](this, status); }
};
function takeInFlight(kind) {
    for (var i = 0; i < inFlight.length; i++) {
        var isPost = inFlight[i].cfg.method === 'POST';
        if ((kind === 'POST') === isPost) {
            return inFlight.splice(i, 1)[0];
        }
    }
    return null;
}

/* ---------- enyo shim ---------- */
var kinds = {};
global.enyo = {
    kind: function (def) { kinds[def.name] = def; return def; },
    inherit: function (fn) { return fn(function () {}); },
    Ajax: FakeAjax,
    json: {stringify: function (v) { return JSON.stringify(v); },
           parse: function (s) { return s ? JSON.parse(s) : null; }},
    bind: function (scope, method) {
        var args = Array.prototype.slice.call(arguments, 2);
        var fn = (typeof method === 'string') ? scope[method] : method;
        return function () { return fn.apply(scope, args.concat(Array.prototype.slice.call(arguments))); };
    },
    log: function () {}, warn: function () {}, error: function () {},
    Control: {}, Checkbox: {}
};
global.Prefs = {getCookie: function (n, d) { return d; }, setCookie: function () {}};
global.navigator = {userAgent: 'test-agent'};
global.enyo.platform = {chrome: 140, touch: true};

function load(rel) {
    var src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // main.js declares `var updateRate` etc at top level; wrap so they stay local
    new Function('enyo', 'window', 'localStorage', 'Prefs', 'setTimeout', 'clearTimeout', 'Date', 'navigator', src)(
        global.enyo, global.window, global.localStorage, global.Prefs,
        global.setTimeout, global.clearTimeout, global.Date, global.navigator);
}
load('enyo-app/source/api/checkmate.js');
load('enyo-app/source/api/version.js');
load('enyo-app/source/views/main.js');

/* ---------- instantiate ---------- */
function resetWorld() {
    for (var k in store) { delete store[k]; }
    pendingTimers.length = 0;
    inFlight.length = 0;
    listCalls.length = 0;
}

function makeApi() {
    var def = kinds['checkmate.api'];
    var api = {};
    for (var k in def) { api[k] = def[k]; }
    api.inherited = function () {};
    api.buildURL = function (a) { return 'https://test/' + a + '.php'; };
    api.notation = 'e2-e4';
    api.grandmaster = 'gm';
    api.create();
    return api;
}

var listCalls = [];
function makeView(api) {
    var def = kinds['checkmate.MainView'];
    var view = {};
    for (var k in def) { view[k] = def[k]; }
    view.inherited = function () {};
    view.$ = {
        myCheckmate: api,
        buttonUpdate: {addClass: function () {}, removeClass: function () {}, setDisabled: function () {}},
        imgSync: {setAttribute: function () {}},
        popupMessage: {setContent: function () {}},
        popupModal: {setShowing: function () {}},
        taskDetails: {inEdit: false, taskGuid: '', render: function () {}, reset: function () {}},
        list: {
            setCount: function (n) { listCalls.push('setCount:' + n); },
            reset: function () { listCalls.push('reset'); },
            renderRow: function (i) { listCalls.push('renderRow:' + i); },
            select: function () {}, deselect: function () {}, isSelected: function () { return false; }
        }
    };
    view.serverTasks = [];
    view.viewTasks = [];
    view.holdTimer = null;
    view.selectedTask = null;
    // rendered() wires these in the real app; the projection only refreshes
    // because the queue tells the view it changed.
    api.onQueueChanged = enyo.bind(view, 'handleQueueChanged');
    api.onRefreshSuccess = enyo.bind(view, 'handleRefreshSuccess');
    api.onPostSuccess = enyo.bind(view, 'handlePostSuccess');
    api.onPostError = enyo.bind(view, 'handlePostError');
    return view;
}

/* ---------- assertions ---------- */
var pass = 0, fail = 0, group = '';
function section(name) { group = name; console.log('\n--- ' + name + ' ---'); }
function ok(name, cond, detail) {
    if (cond) { pass++; console.log('  ok    ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? '  <<< ' + JSON.stringify(detail) : '')); }
}
function task(guid, title, pos, done) {
    return {guid: guid, title: title, notes: '', completed: !!done, sortPosition: pos};
}
function titles(list) {
    var out = []; for (var i = 0; i < list.length; i++) { out.push(list[i].guid); } return out.join(',');
}
function byGuid(list, guid) {
    for (var i = 0; i < list.length; i++) { if (list[i].guid === guid) { return list[i]; } }
    return null;
}

/* ================= TRACE A ================= */
section('Trace A: a stale GET must not un-check a task');
(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    v.serverTasks = [task('A', 'First', 3), task('B', 'Second', 2)];
    v.refreshProjection();
    ok('starts unchecked', byGuid(v.viewTasks, 'B').completed === false);

    // user checks B -> op queued, projection shows it immediately
    var checked = v.toWireTask(byGuid(v.viewTasks, 'B'));
    checked.completed = true;
    api.updateTask(checked);
    ok('checkbox shows checked right away', byGuid(v.viewTasks, 'B').completed === true);

    // the stale GET issued BEFORE the tap now lands, still saying completed:false
    v.handleRefreshSuccess(null, {tasks: [task('A', 'First', 3), task('B', 'Second', 2, false)]});
    ok('STILL checked after the stale refresh', byGuid(v.viewTasks, 'B').completed === true,
       byGuid(v.viewTasks, 'B'));
    ok('server truth itself was updated', v.serverTasks[1].completed === false);
    ok('the op is still queued to be sent', api.getPendingOps().length === 1);
})();

/* ================= TRACE B ================= */
section('Trace B: a refresh inside the undo window must not cancel a delete');
(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    v.serverTasks = [task('A', 'First', 3), task('B', 'Second', 2), task('C', 'Third', 1)];
    v.refreshProjection();

    var tombstone = v.toWireTask(byGuid(v.viewTasks, 'C'));
    tombstone.sortPosition = -1;
    api.queueOp(tombstone, 'delete', api.deleteHoldMs);
    v.refreshProjection();
    ok('row stays visible during undo window', v.viewTasks.length === 3);
    ok('row is flagged as deleting', byGuid(v.viewTasks, 'C')._deleting === true);

    // background refresh lands mid-window; server has not seen the delete yet
    v.handleRefreshSuccess(null, {tasks: [task('A', 'First', 3), task('B', 'Second', 2), task('C', 'Third', 1)]});
    ok('still flagged as deleting after refresh', byGuid(v.viewTasks, 'C')._deleting === true);
    ok('delete op survived the refresh', api.getPendingOps().length === 1);

    // undo window expires
    advance(api.deleteHoldMs + 100);
    v.refreshProjection();
    ok('row disappears once the hold expires', byGuid(v.viewTasks, 'C') === null, titles(v.viewTasks));
    ok('op is now due to send', api.nextDueOp() !== null);
})();

/* ================= TRACE C ================= */
section('Trace C: deleting several tasks between syncs');
(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    v.serverTasks = [task('A', 'First', 3), task('B', 'Second', 2), task('C', 'Third', 1)];
    v.refreshProjection();

    var tA = v.toWireTask(byGuid(v.viewTasks, 'A')); tA.sortPosition = -1;
    api.queueOp(tA, 'delete', api.deleteHoldMs);
    advance(1000);
    var tB = v.toWireTask(byGuid(v.viewTasks, 'B')); tB.sortPosition = -1;
    api.queueOp(tB, 'delete', api.deleteHoldMs);
    ok('two deletes queued', api.getPendingOps().length === 2);

    advance(api.deleteHoldMs + 100);
    v.refreshProjection();
    ok('both rows hidden immediately', titles(v.viewTasks) === 'C', titles(v.viewTasks));

    // drain the first delete; server answers with A gone (list length CHANGED,
    // which is exactly what used to orphan the second delete)
    api.processQueue();
    var post1 = takeInFlight('POST');
    ok('first delete was sent', post1 !== null);
    post1.succeed({tasks: [task('B', 'Second', 2), task('C', 'Third', 1)]});
    v.handlePostSuccess(null, {tasks: [task('B', 'Second', 2), task('C', 'Third', 1)]}, api.hasPendingOps());

    ok('second delete SURVIVED the wholesale server replace', api.getPendingOps().length === 1,
       api.getPendingOps());
    ok('B is still hidden from view', byGuid(v.viewTasks, 'B') === null, titles(v.viewTasks));

    // drain the second
    runDueTimers();
    api.processQueue();
    var post2 = takeInFlight('POST');
    ok('second delete was actually sent', post2 !== null);
    ok('  and it carries the tombstone, not the live row',
       post2 && JSON.parse(post2.cfg.postBody).sortPosition === -1,
       post2 ? post2.cfg.postBody : null);
    post2.succeed({tasks: [task('C', 'Third', 1)]});
    v.handlePostSuccess(null, {tasks: [task('C', 'Third', 1)]}, api.hasPendingOps());
    ok('queue drained', api.getPendingOps().length === 0);
    ok('only C remains', titles(v.viewTasks) === 'C', titles(v.viewTasks));
})();

/* ================= QUEUE ================= */
section('Queue: snapshots, coalescing, supersede');
(function () {
    resetWorld(); var api = makeApi();
    var live = task('A', 'First', 3);
    api.updateTask(live);
    // mutating the caller's object must not change what will be posted
    live.title = 'MUTATED AFTER ENQUEUE';
    ok('op holds a snapshot, not a reference', api.getPendingOps()[0].task.title === 'First',
       api.getPendingOps()[0].task.title);

    resetWorld(); var api2 = makeApi();
    api2.queueOp(task('A', 'First', 3, false), 'update', 0);
    api2.queueOp(task('A', 'First', 3, true), 'update', 0);
    api2.queueOp(task('A', 'First', 3, false), 'update', 0);
    ok('three toggles coalesce to one op', api2.getPendingOps().length === 1, api2.getPendingOps().length);
    ok('  keeping the final state', api2.getPendingOps()[0].task.completed === false);

    resetWorld(); var api3 = makeApi();
    api3.queueOp(task('A', 'Edited', 3), 'update', 0);
    var tomb = task('A', 'Edited', -1); tomb.sortPosition = -1;
    api3.queueOp(tomb, 'delete', 0);
    ok('a delete supersedes a queued edit for the same task', api3.getPendingOps().length === 1);
    ok('  and the survivor is the delete', api3.getPendingOps()[0].type === 'delete');

    resetWorld(); var api4 = makeApi();
    api4.queueOp(task('A', 'A', 3), 'update', 0);
    api4.queueOp(task('B', 'B', 2), 'update', 0);
    ok('different tasks do not coalesce', api4.getPendingOps().length === 2);
})();

section('Queue: failure handling');
(function () {
    // 4xx is permanent -> dead-letter that one op, keep the rest
    resetWorld(); var api = makeApi();
    var reported = [];
    api.onPostError = function (op) { reported.push(op.guid); };
    api.queueOp(task('BAD', '', 3), 'update', 0);
    api.queueOp(task('GOOD', 'Fine', 2), 'update', 0);
    api.processQueue();
    takeInFlight('POST').fail(400, {error: 'incoming task data could not be validated'});
    ok('the rejected op is dropped', api.getPendingOps().length === 1, api.getPendingOps().length);
    ok('  the unrelated op survives', api.getPendingOps()[0].guid === 'GOOD');
    ok('  and the user is told which task failed', reported.length === 1 && reported[0] === 'BAD');
    ok('  no retries burned on a permanent failure', api.queueRetryCount === 0);

    // 5xx is transient -> retry
    resetWorld(); var api5 = makeApi();
    api5.queueOp(task('A', 'First', 3), 'update', 0);
    api5.processQueue();
    takeInFlight('POST').fail(503, {error: 'try again'});
    ok('a 5xx keeps the op queued', api5.getPendingOps().length === 1);
    ok('  and schedules a retry', api5.queueRetryCount === 1);

    // 200 carrying an error body must not be treated as applied
    resetWorld(); var api6 = makeApi();
    api6.queueOp(task('A', 'First', 3), 'update', 0);
    api6.processQueue();
    takeInFlight('POST').succeed({error: 'failed to write to file'});
    ok('200-with-error-body does not silently drop the op as applied',
       api6.getPendingOps().length === 0 && api6.deadLetters.length === 1);
})();

section('Queue: survives an app restart');
(function () {
    resetWorld(); var api = makeApi();
    api.queueOp(task('A', 'Unsent edit', 3), 'update', 0);
    ok('op was persisted', localStorage.getItem('pendingOps') !== null);
    pendingTimers.length = 0; inFlight.length = 0;
    var revived = makeApi();
    ok('op came back after restart', revived.getPendingOps().length === 1, revived.getPendingOps().length);
    ok('  with its payload intact', revived.getPendingOps()[0].task.title === 'Unsent edit');
    localStorage.removeItem('pendingOps');
})();

/* ================= REFRESH SEQUENCING ================= */
section('Refreshes: only the newest response may apply');
(function () {
    resetWorld(); var api = makeApi();
    var applied = [];
    api.onRefreshSuccess = function (s, r) { applied.push(r.tag); };
    api.getTasks();
    var first = takeInFlight('GET');
    api.getTasks();
    var second = takeInFlight('GET');
    // the older request answers last
    second.succeed({tasks: [], tag: 'newer'});
    first.succeed({tasks: [], tag: 'older'});
    ok('the superseded response is discarded', applied.length === 1, applied);
    ok('  and the newest one applied', applied[0] === 'newer');
})();

section('Refreshes: never pull while writes are pending');
(function () {
    resetWorld(); var api = makeApi();
    api.queueOp(task('A', 'First', 3), 'update', 0);
    api.processQueue();
    ok('a POST went out', takeInFlight('POST') !== null);
    ok('  and no GET was issued alongside it', takeInFlight('GET') === null);
})();

/* ================= RENDERING ================= */
section('Rendering: minimal redraw');
(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    v.serverTasks = [task('A', 'First', 3), task('B', 'Second', 2), task('C', 'Third', 1)];
    v.refreshProjection();
    listCalls.length = 0;

    // content-only change on one row
    v.handleRefreshSuccess(null, {tasks: [task('A', 'First', 3), task('B', 'CHANGED', 2), task('C', 'Third', 1)]});
    ok('one changed row -> one renderRow, no full reset',
       listCalls.join(',') === 'renderRow:1', listCalls.join(','));

    // a removal is structural
    listCalls.length = 0;
    v.handleRefreshSuccess(null, {tasks: [task('A', 'First', 3), task('C', 'Third', 1)]});
    ok('a structural change resets the list',
       listCalls.indexOf('reset') !== -1, listCalls.join(','));
})();

section('Rendering: remote reorder is applied correctly');
(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    v.serverTasks = [task('A', 'First', 3), task('B', 'Second', 2), task('C', 'Third', 1)];
    v.refreshProjection();
    // another device reorders: same set, same count, different order
    v.handleRefreshSuccess(null, {tasks: [task('C', 'Third', 3), task('B', 'Second', 2), task('A', 'First', 1)]});
    ok('order follows the server', titles(v.viewTasks) === 'C,B,A', titles(v.viewTasks));
    ok('titles stayed with their own guids',
       byGuid(v.viewTasks, 'A').title === 'First' && byGuid(v.viewTasks, 'C').title === 'Third');
})();

/* ================= CREATES ================= */
section('Creates: client-generated guids');
(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    v.serverTasks = [task('A', 'First', 3)];
    v.refreshProjection();
    v.$.contentPanels = {setIndex: function () {}};
    v.$.taskDetails = {taskTitle: 'Brand new', taskNotes: 'notes', inEdit: false, taskGuid: ''};
    v.updateTaskFromDetails();

    var ops = api.getPendingOps();
    ok('one create queued', ops.length === 1);
    var guid = ops[0].task.guid;
    ok('guid is a uuid, not "new"', /^[0-9a-f-]{36}$/.test(guid), guid);
    ok('  passes the service validator regex', /^[a-zA-Z0-9_-]{6,50}$/.test(guid), guid);
    ok('appears in the list immediately', byGuid(v.viewTasks, guid) !== null, titles(v.viewTasks));
    ok('  sorted above the existing task', v.viewTasks[0].guid === guid, titles(v.viewTasks));

    // a retry targets the same guid, so it cannot duplicate
    api.processQueue();
    var post = takeInFlight('POST');
    ok('posted with the client guid', JSON.parse(post.cfg.postBody).guid === guid);
})();

section('Creates: empty title is refused locally');
(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    var shown = null;
    v.showModal = function (m) { shown = m; };
    v.serverTasks = [task('A', 'First', 3)];
    v.refreshProjection();
    v.$.contentPanels = {setIndex: function () {}};
    v.$.taskDetails = {taskTitle: '', taskNotes: '', inEdit: false, taskGuid: ''};
    v.selectedTask = byGuid(v.viewTasks, 'A');
    v.updateTaskFromDetails();
    ok('no op queued for an empty title', api.getPendingOps().length === 0);
    ok('  and the user is told why', shown !== null, shown);
})();


section('Regressions caught in review');
(function () {
    // per-op retry budget: a flaky op must not spend the next op's allowance
    resetWorld(); var api = makeApi();
    api.queueOp(task('A', 'Flaky', 3), 'update', 0);
    api.queueOp(task('B', 'Fine', 2), 'update', 0);
    api.processQueue();
    takeInFlight('POST').fail(503);
    runDueTimers();
    api.processQueue();
    var again = takeInFlight('POST');
    ok('the retry re-sends the SAME op', again && JSON.parse(again.cfg.postBody).guid === 'A');
    ok('  and it is that op carrying the count', api.getPendingOps()[0].retries === 1,
       api.getPendingOps()[0].retries);
    ok('  the untouched op has none', api.getPendingOps()[1].retries === undefined);
})();

(function () {
    // a 5xx refresh must not drop the app to offline with a modal
    resetWorld(); var api = makeApi(); var v = makeView(api);
    var shown = null; v.showModal = function (m) { shown = m; };
    var wentOffline = false; v.showAsOffline = function () { wentOffline = true; };
    v.handleRefreshError({xhrResponse: {status: 503}}, 'Notation content could not be parsed. Please try again.');
    ok('a transient 503 shows no modal', shown === null, shown);
    ok('  and does not force offline', wentOffline === false);
    // but three in a row still should
    v.handleRefreshError({xhrResponse: {status: 503}}, 'x');
    v.handleRefreshError({xhrResponse: {status: 503}}, 'x');
    ok('  three consecutive transients do go offline', wentOffline === true);

    // a 403 is permanent and should say so
    resetWorld(); var api2 = makeApi(); var v2 = makeView(api2);
    var shown2 = null; v2.showModal = function (m) { shown2 = m; };
    var offline2 = false; v2.showAsOffline = function () { offline2 = true; };
    v2.handleRefreshError({xhrResponse: {status: 403}}, 'Illegal move. You are not the Grand Master.');
    ok('a 403 shows the server message', shown2 !== null && shown2.indexOf('Illegal move') !== -1, shown2);
    ok('  and goes offline', offline2 === true);
})();

(function () {
    // editing a task that vanished must not create a duplicate
    resetWorld(); var api = makeApi(); var v = makeView(api);
    var shown = null; v.showModal = function (m) { shown = m; };
    v.serverTasks = [task('A', 'First', 3)];
    v.refreshProjection();
    v.selectedTask = byGuid(v.viewTasks, 'A');
    // it disappears from under us
    v.handleRefreshSuccess(null, {tasks: []});
    v.$.contentPanels = {setIndex: function () {}};
    v.$.taskDetails = {taskTitle: 'Edited title', taskNotes: '', inEdit: false, taskGuid: 'A'};
    v.updateTaskFromDetails();
    ok('no resurrection as a new task', api.getPendingOps().length === 0, api.getPendingOps());
    ok('  and the user is told', shown !== null && shown.indexOf('no longer exists') !== -1, shown);
})();


section('about:version build report');
(function () {
    var realStamp = BuildInfo.stamp;

    // unstamped bundle should say so rather than lying
    BuildInfo.stamp = '__CHECKMATE_BUILD__';
    ok('unstamped source reports itself', BuildInfo.getVersion().indexOf('unbuilt') !== -1,
       BuildInfo.getVersion());
    ok('  isStamped() is false', BuildInfo.isStamped() === false);

    BuildInfo.stamp = '2.3.0-0007';
    ok('a stamped bundle reports its version', BuildInfo.getVersion() === '2.3.0-0007');
    ok('  isStamped() is true', BuildInfo.isStamped() === true);

    var note = BuildInfo.describe({serviceWorker: 'checkmate-v2.3.0-0007', updateStatus: 'up to date'});
    ok('note carries the app build', note.indexOf('2.3.0-0007') !== -1, note);
    ok('note carries the service worker version', note.indexOf('checkmate-v2.3.0-0007') !== -1, note);
    ok('note names the display mode', note.indexOf('Display mode:') !== -1, note);
    ok('note names the update status', note.indexOf('up to date') !== -1, note);
    ok('note is within the 1000 char server limit', note.length <= 1000, note.length);

    // the service rejects nothing here, but strip_tags() would silently eat
    // anything angle-bracketed, so it must never reach the wire
    ok('angle brackets are stripped', BuildInfo.sanitize('a <b> c').indexOf('<') === -1);
    ok('over-long values are truncated', BuildInfo.sanitize(new Array(500).join('x')).length <= 220);

    var unknown = BuildInfo.describe(null);
    ok('missing update status says so', unknown.indexOf('Update status:  unknown') !== -1, unknown);
    ok('missing service worker info says so', unknown.indexOf('not available') !== -1, unknown);

    BuildInfo.stamp = realStamp;
})();

(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    var realStamp = BuildInfo.stamp;
    BuildInfo.stamp = '2.3.0-0007';
    v.serviceWorkerVersion = 'checkmate-v2.3.0-0007';
    v.serverTasks = [task('A', 'First', 3)];
    v.refreshProjection();
    v.$.contentPanels = {setIndex: function () {}};

    // creating it fills the notes regardless of what was typed
    v.$.taskDetails = {taskTitle: 'about:version', taskNotes: 'ignore me', inEdit: false, taskGuid: ''};
    v.updateTaskFromDetails();
    var ops = api.getPendingOps();
    ok('the magic title still creates a real task', ops.length === 1);
    ok('  notes replaced with the build report', ops[0].task.notes.indexOf('2.3.0-0007') !== -1,
       ops[0].task.notes);
    ok('  title kept verbatim', ops[0].task.title === 'about:version');

    // a normal task is untouched
    resetWorld(); var api2 = makeApi(); var v2 = makeView(api2);
    v2.serverTasks = []; v2.refreshProjection();
    v2.$.contentPanels = {setIndex: function () {}};
    v2.$.taskDetails = {taskTitle: 'about:versions', taskNotes: 'my notes', inEdit: false, taskGuid: ''};
    v2.updateTaskFromDetails();
    ok('a near-miss title is left alone', api2.getPendingOps()[0].task.notes === 'my notes',
       api2.getPendingOps()[0].task.notes);

    // re-saving an existing one refreshes the reading
    resetWorld(); var api3 = makeApi(); var v3 = makeView(api3);
    BuildInfo.stamp = '2.3.0-0009';
    v3.serviceWorkerVersion = 'checkmate-v2.3.0-0009';
    v3.serverTasks = [task('Z', 'about:version', 5)];
    v3.serverTasks[0].notes = 'App build:      2.3.0-0001';
    v3.refreshProjection();
    v3.selectedTask = byGuid(v3.viewTasks, 'Z');
    v3.$.contentPanels = {setIndex: function () {}};
    v3.$.taskDetails = {taskTitle: 'about:version', taskNotes: 'stale', inEdit: false, taskGuid: 'Z'};
    v3.updateTaskFromDetails();
    ok('re-saving refreshes the reading', api3.getPendingOps()[0].task.notes.indexOf('2.3.0-0009') !== -1,
       api3.getPendingOps()[0].task.notes);

    BuildInfo.stamp = realStamp;
})();

console.log('\n========================================');
console.log('  passed: ' + pass + '   failed: ' + fail);
console.log('========================================\n');
process.exit(fail === 0 ? 0 : 1);
