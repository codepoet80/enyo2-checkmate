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
    kind: function (def) {
        // Real Enyo generates getX/setX for every published property. Without
        // these, anything that reads a published value back through its getter
        // -- buildURL(), applyServerConfig() -- can't be exercised at all.
        if (def.published) {
            Object.keys(def.published).forEach(function (name) {
                var cap = name.charAt(0).toUpperCase() + name.slice(1);
                if (def[name] === undefined) { def[name] = def.published[name]; }
                if (!def['get' + cap]) {
                    def['get' + cap] = function () {
                        return this[name] !== undefined ? this[name] : def.published[name];
                    };
                }
                if (!def['set' + cap]) {
                    def['set' + cap] = function (v) {
                        this[name] = v;
                        if (this[name + 'Changed']) { this[name + 'Changed'](); }
                    };
                }
            });
        }
        kinds[def.name] = def;
        return def;
    },
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
global.CheckmateScramble = require(path.join(ROOT, 'enyo-app/source/api/scramble.js'));

load('enyo-app/source/api/checkmate.js');
load('enyo-app/source/api/version.js');
load('enyo-app/source/views/main.js');
load('enyo-app/source/views/signin.js');
load('enyo-app/source/views/SpellCheckInput.js');
load('enyo-app/source/views/detail.js');

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

//The sign-in panel is mostly widgets, so the stubs only need to record what the
//  flow does to them. Everything the account-creation path touches is here.
function makeSignin(credentialsResult) {
    var def = kinds['checkmate.Signin'];
    var view = {};
    for (var k in def) { view[k] = def[k]; }
    view.inherited = function () {};

    function label(name) {
        return {name: name, content: '', setContent: function (c) { this.content = c; }};
    }
    function input(name) {
        return {name: name, value: '', getValue: function () { return this.value; },
                setValue: function (v) { this.value = v; }};
    }
    function toggle(name) {
        return {name: name, value: false, getValue: function () { return this.value; },
                setValue: function (v) { this.value = v; }, setDisabled: function () {}};
    }
    function drawer(name) {
        return {name: name, open: false, setOpen: function (o) { this.open = o; }};
    }
    function button(name, content) {
        return {name: name, content: content, disabled: false,
                setContent: function (c) { this.content = c; },
                setDisabled: function (d) { this.disabled = d; }};
    }

    view.$ = {
        drawerTOS: drawer('drawerTOS'),
        drawerNewAccount: drawer('drawerNewAccount'),
        drawerServer: drawer('drawerServer'),
        textTOS: label('textTOS'),
        textNewMove: label('textNewMove'),
        textNewGrandmaster: label('textNewGrandmaster'),
        inputMove: input('inputMove'),
        inputGrandmaster: input('inputGrandmaster'),
        inputCustomServer: input('inputCustomServer'),
        checkInsecure: toggle('checkInsecure'),
        checkCustomServer: toggle('checkCustomServer'),
        buttonCreate: button('buttonCreate', 'Create'),
        buttonLogin: button('buttonLogin', 'Log In'),
        popupAgree: {showing: false, setShowing: function (v) { this.showing = v; }},
        popupAgreeMessage: label('popupAgreeMessage')
    };

    // published properties the panel reads back through its own getters
    var props = {urlBase: 'checkmate.wosa.link', insecure: false, useCustomServer: false, customServer: ''};
    view.getUrlBase = function () { return props.urlBase; };
    view.setInsecure = function (v) { props.insecure = v; };
    view.getInsecure = function () { return props.insecure; };
    view.setUseCustomServer = function (v) { props.useCustomServer = v; };
    view.getUseCustomServer = function () { return props.useCustomServer; };
    view.setCustomServer = function (v) { props.customServer = v; };
    view.getCustomServer = function () { return props.customServer; };
    view.props = props;

    view.messages = [];
    view.doMessage = function () { this.messages.push(this.messageToShow); };
    view.loginCalls = 0;
    view.doLogin = function () { this.loginCalls++; };

    view.apiConfig = {};
    view.credentialCalls = 0;
    view.api = {
        setInsecure: function (v) { view.apiConfig.insecure = v; },
        setUseCustomServer: function (v) { view.apiConfig.useCustomServer = v; },
        setCustomServer: function (v) { view.apiConfig.customServer = v; },
        getNewCredentials: function (success, failure) {
            view.credentialCalls++;
            if (credentialsResult && credentialsResult.fail !== undefined) {
                failure(credentialsResult.fail);
            } else {
                success(credentialsResult);
            }
        }
    };
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
// Task text goes over the wire scrambled, so anything asserting on an op's
// payload has to read it the way the service's other clients do.
function wireText(view, text) {
    return CheckmateScramble.reveal(view.scrambleMove(), text);
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

    var note = BuildInfo.describe();
    ok('note carries the app build', note.indexOf('2.3.0-0007') !== -1, note);
    ok('note names the display mode', note.indexOf('Display mode:') !== -1, note);
    ok('note is within the 1000 char server limit', note.length <= 1000, note.length);

    // build metadata is machine-generated and lands in a field the app renders,
    // so keep markup out of it at the source
    ok('angle brackets are stripped', BuildInfo.sanitize('a <b> c').indexOf('<') === -1);
    ok('over-long values are truncated', BuildInfo.sanitize(new Array(500).join('x')).length <= 220);


    BuildInfo.stamp = realStamp;
})();

(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    var realStamp = BuildInfo.stamp;
    BuildInfo.stamp = '2.3.0-0007';
    v.serverTasks = [task('A', 'First', 3)];
    v.refreshProjection();
    v.$.contentPanels = {setIndex: function () {}};

    // creating it fills the notes regardless of what was typed
    v.$.taskDetails = {taskTitle: 'about:version', taskNotes: 'ignore me', inEdit: false, taskGuid: ''};
    v.updateTaskFromDetails();
    var ops = api.getPendingOps();
    ok('the magic title still creates a real task', ops.length === 1);
    ok('  notes replaced with the build report', wireText(v, ops[0].task.notes).indexOf('2.3.0-0007') !== -1,
       wireText(v, ops[0].task.notes));
    ok('  title kept verbatim', wireText(v, ops[0].task.title) === 'about:version');

    // a normal task is untouched
    resetWorld(); var api2 = makeApi(); var v2 = makeView(api2);
    v2.serverTasks = []; v2.refreshProjection();
    v2.$.contentPanels = {setIndex: function () {}};
    v2.$.taskDetails = {taskTitle: 'about:versions', taskNotes: 'my notes', inEdit: false, taskGuid: ''};
    v2.updateTaskFromDetails();
    ok('a near-miss title is left alone', wireText(v2, api2.getPendingOps()[0].task.notes) === 'my notes',
       wireText(v2, api2.getPendingOps()[0].task.notes));

    // re-saving an existing one refreshes the reading
    resetWorld(); var api3 = makeApi(); var v3 = makeView(api3);
    BuildInfo.stamp = '2.3.0-0009';
    v3.serverTasks = [task('Z', 'about:version', 5)];
    v3.serverTasks[0].notes = 'App build:      2.3.0-0001';
    v3.refreshProjection();
    v3.selectedTask = byGuid(v3.viewTasks, 'Z');
    v3.$.contentPanels = {setIndex: function () {}};
    v3.$.taskDetails = {taskTitle: 'about:version', taskNotes: 'stale', inEdit: false, taskGuid: 'Z'};
    v3.updateTaskFromDetails();
    ok('re-saving refreshes the reading', wireText(v3, api3.getPendingOps()[0].task.notes).indexOf('2.3.0-0009') !== -1,
       wireText(v3, api3.getPendingOps()[0].task.notes));

    BuildInfo.stamp = realStamp;
})();

/* ================= SCRAMBLING ================= */
section('Scrambled at rest');
(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    var move = v.scrambleMove();

    // A user who has been here for years has plaintext tasks. They must read
    // normally, and they must NOT be rewritten by anything but a real edit.
    var plain = task('P', 'Old plaintext task', 5);
    plain.notes = 'old notes';
    var scrambled = task('S', CheckmateScramble.scramble(move, 'Hidden task'), 4);
    scrambled.notes = CheckmateScramble.scramble(move, 'Hidden notes');
    v.serverTasks = [plain, scrambled];
    v.refreshProjection();

    ok('plaintext task reads as itself', byGuid(v.viewTasks, 'P').title === 'Old plaintext task');
    ok('scrambled task is revealed for display', byGuid(v.viewTasks, 'S').title === 'Hidden task');
    ok('  including its notes', byGuid(v.viewTasks, 'S').notes === 'Hidden notes');
    ok('the blob never reaches the view layer as the title',
       byGuid(v.viewTasks, 'S').title.indexOf('cm1:') === -1);

    // Ticking a box is not an edit: both tasks must go back byte-identical.
    var toggled = v.toWireTask(byGuid(v.viewTasks, 'P'));
    toggled.completed = true;
    api.updateTask(toggled);
    ok('a toggle leaves plaintext plaintext', api.getPendingOps()[0].task.title === 'Old plaintext task');

    resetWorld(); var api2 = makeApi(); var v2 = makeView(api2);
    v2.serverTasks = [scrambled]; v2.refreshProjection();
    var toggled2 = v2.toWireTask(byGuid(v2.viewTasks, 'S'));
    toggled2.completed = true;
    api2.updateTask(toggled2);
    ok('a toggle re-sends the original blob unchanged',
       api2.getPendingOps()[0].task.title === scrambled.title);

    // A reorder is not an edit either.
    resetWorld(); var api3 = makeApi(); var v3 = makeView(api3);
    v3.serverTasks = [task('P', 'Old plaintext task', 5), scrambled];
    v3.refreshProjection();
    v3.$.taskDetails = {inEdit: false, taskGuid: '', render: function () {}, reset: function () {}};
    v3.listReorderDone(null, {reorderFrom: 0, reorderTo: 1});
    var batch = api3.getPendingOps()[0].task;
    var sentTitles = [batch[0].title, batch[1].title].sort().join('|');
    ok('a reorder rewrites no task text',
       sentTitles === ['Old plaintext task', scrambled.title].sort().join('|'), sentTitles);

    // Editing IS the moment a task becomes scrambled.
    resetWorld(); var api4 = makeApi(); var v4 = makeView(api4);
    v4.serverTasks = [task('P', 'Old plaintext task', 5)];
    v4.refreshProjection();
    v4.selectedTask = byGuid(v4.viewTasks, 'P');
    v4.$.contentPanels = {setIndex: function () {}};
    v4.$.taskDetails = {taskTitle: 'Now edited', taskNotes: 'now with notes', inEdit: false, taskGuid: 'P'};
    v4.updateTaskFromDetails();
    var edited = api4.getPendingOps()[0].task;
    ok('editing scrambles the title', CheckmateScramble.isScrambled(edited.title));
    ok('  and the notes', CheckmateScramble.isScrambled(edited.notes));
    ok('  and it still says what the user typed', wireText(v4, edited.title) === 'Now edited');

    // New tasks are born scrambled.
    resetWorld(); var api5 = makeApi(); var v5 = makeView(api5);
    v5.serverTasks = []; v5.refreshProjection();
    v5.$.contentPanels = {setIndex: function () {}};
    v5.$.taskDetails = {taskTitle: 'Brand new', taskNotes: '', inEdit: false, taskGuid: ''};
    v5.updateTaskFromDetails();
    ok('a new task is created scrambled', CheckmateScramble.isScrambled(api5.getPendingOps()[0].task.title));

    // Text the old service would have mangled must survive a full round trip.
    resetWorld(); var api6 = makeApi(); var v6 = makeView(api6);
    v6.serverTasks = []; v6.refreshProjection();
    v6.$.contentPanels = {setIndex: function () {}};
    v6.$.taskDetails = {taskTitle: 'Tom & Jerry: 5 < 6', taskNotes: '', inEdit: false, taskGuid: ''};
    v6.updateTaskFromDetails();
    var born = api6.getPendingOps()[0].task;
    ok('ampersands and angle brackets survive the wire',
       wireText(v6, born.title) === 'Tom & Jerry: 5 < 6', wireText(v6, born.title));
    // ...and come back out of a refresh intact
    v6.serverTasks = [{guid: born.guid, title: born.title, notes: born.notes,
                       completed: false, sortPosition: born.sortPosition}];
    api6.clearQueue();
    v6.refreshProjection();
    ok('  and read back intact after a refresh',
       byGuid(v6.viewTasks, born.guid).title === 'Tom & Jerry: 5 < 6');

    // Anything reaching an allowHtml control has to be escaped by the app now
    // that the service stores raw text.
    ok('markup is escaped before it is rendered',
       v6.escapeHtml('<script>x</script> & "q"') === '&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;',
       v6.escapeHtml('<script>x</script> & "q"'));

    // A blob we cannot read (wrong notation, truncated file) must still show
    // the user that a row is there rather than rendering an empty task.
    resetWorld(); var api7 = makeApi(); var v7 = makeView(api7);
    v7.serverTasks = [task('X', 'cm1:notreallybase64!!', 1)];
    v7.refreshProjection();
    ok('an unreadable blob is left visible', byGuid(v7.viewTasks, 'X').title === 'cm1:notreallybase64!!');
})();

/* ================= ACCOUNT CREATION ================= */
section('Creating an account');
(function () {
    var creds = {move: "Bishop to King's Rook 8", grandmaster: 'Hao Wang', newfile: 'notations/bishop-kingsrook8.json'};

    // Tapping Create asks first -- it is the one irreversible thing this screen
    // does, and the service picks credentials that can never be changed.
    var v = makeSignin(creds);
    v.tapCreate();
    ok('Create asks before it creates', v.$.popupAgree.showing === true);
    ok('  and nothing was created yet', v.credentialCalls === 0);
    ok('  and the terms are put in front of the user', v.$.drawerTOS.open === true);
    ok('  and the prompt names the server', v.$.popupAgreeMessage.content.indexOf('checkmate.wosa.link') !== -1,
       v.$.popupAgreeMessage.content);

    v.cancelCreate();
    ok('Cancel dismisses without creating', v.$.popupAgree.showing === false && v.credentialCalls === 0);
    ok('  and Create is still offered', v.$.buttonCreate.disabled === false);

    // Agreeing creates exactly one account.
    v.tapCreate();
    v.confirmCreate();
    ok('agreeing creates the account', v.credentialCalls === 1);
    ok('  the popup closes', v.$.popupAgree.showing === false);
    ok('  the credentials are shown', v.$.drawerNewAccount.open === true);
    ok('  the move is displayed in the clear', v.$.textNewMove.content === "Bishop to King's Rook 8");
    ok('  the grandmaster too', v.$.textNewGrandmaster.content === 'Hao Wang');

    // The grandmaster field is a password input and masks what it holds, so the
    // drawer above is the user's only chance to copy it down -- but both fields
    // are filled so Log In just works.
    ok('  the move is filled in for log-in', v.$.inputMove.value === "Bishop to King's Rook 8");
    ok('  the grandmaster is filled in for log-in', v.$.inputGrandmaster.value === 'Hao Wang');

    v.tapLogin();
    ok('Log In works straight afterwards', v.loginCalls === 1);

    // A second tap must not strand the first set of credentials on the server.
    var before = v.credentialCalls;
    v.tapCreate();
    ok('a second Create does not mint another account', v.credentialCalls === before);
    ok('  and says why', v.messages[v.messages.length - 1].indexOf('already created') !== -1,
       v.messages[v.messages.length - 1]);
    ok('  without reopening the prompt', v.$.popupAgree.showing === false);

    // The service answers 200 with an error body for some failures, so a
    // response is not the same thing as a pair of credentials.
    var v2 = makeSignin({error: 'failed to write to file'});
    v2.tapCreate(); v2.confirmCreate();
    ok('an error body is not treated as success', v2.$.drawerNewAccount.open === false);
    ok('  the user is told', v2.messages.length === 1 && v2.messages[0].indexOf('could not be created') !== -1);
    ok('  the reason is passed through', v2.messages[0].indexOf('failed to write to file') !== -1, v2.messages[0]);
    ok('  and Create can be tried again', v2.$.buttonCreate.disabled === false && v2.$.buttonCreate.content === 'Create');

    var v3 = makeSignin({fail: null});
    v3.tapCreate(); v3.confirmCreate();
    ok('a transport failure is reported', v3.messages.length === 1);
    ok('  with something actionable', v3.messages[0].indexOf('unreachable') !== -1, v3.messages[0]);
    ok('  and Create is offered again', v3.$.buttonCreate.disabled === false);

    var v4 = makeSignin({move: "Bishop to King's Rook 8"});   // no grandmaster
    v4.tapCreate(); v4.confirmCreate();
    ok('half a response is not a success', v4.$.drawerNewAccount.open === false && v4.messages.length === 1);

    // Ticking "Use Self Host Server" and then tapping Create used to mint the
    // account on the shared service, because the api kept the config it was
    // built with.
    var v5 = makeSignin(creds);
    v5.$.checkCustomServer.setValue(true);
    v5.$.inputCustomServer.setValue('todo.example.test');
    v5.tapCreate();
    ok('the self-host setting reaches the api before creating', v5.apiConfig.customServer === 'todo.example.test');
    ok('  and is switched on', v5.apiConfig.useCustomServer === true);
    ok('  and the prompt names that server', v5.$.popupAgreeMessage.content.indexOf('todo.example.test') !== -1,
       v5.$.popupAgreeMessage.content);

    // On a first run there is no config cookie at all, which is what the old
    // "go create one in a browser" message read through -- it threw before it
    // could be shown.
    var v6 = makeSignin(creds);
    v6.serverConfig = undefined;
    v6.$.inputMove.setValue(''); v6.$.inputGrandmaster.setValue('');
    v6.tapLogin();
    ok('logging in with empty fields explains itself', v6.messages.length === 1);
    ok('  and points at Create rather than a browser', v6.messages[0].indexOf('tap Create') !== -1, v6.messages[0]);
    ok('  and does not attempt a log-in', v6.loginCalls === 0);
})();

/* ================= SERVER SETTINGS ================= */
section('Server settings reach the api');
(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    // makeApi() stubs buildURL; put the real one back so we can see where a
    // call would actually go.
    api.buildURL = kinds['checkmate.api'].buildURL;

    v.applyServerConfig({urlBase: 'todo.example.test', insecure: false,
                         useCustomServer: false, customServer: ''});
    ok('the url base is applied', api.getUrlBase() === 'todo.example.test');
    ok('  and is used', api.buildURL('read-notation') === 'https://todo.example.test/read-notation.php');

    v.applyServerConfig({urlBase: 'todo.example.test', insecure: true,
                         useCustomServer: true, customServer: 'lan.example.test:8080'});
    ok('a self-host server wins over the default', api.buildURL('read-notation').indexOf('lan.example.test:8080') !== -1);
    ok('  and the insecure setting is honoured', api.buildURL('read-notation').indexOf('http://') === 0,
       api.buildURL('read-notation'));

    v.applyServerConfig(null);
    ok('a missing config is ignored rather than throwing', api.getUrlBase() === 'todo.example.test');

    // Logging in has to go through those setters. It used to assign a
    // `serverConfig` property the api kind doesn't have, which changed nothing:
    // a self-hosting user who logged in kept talking to the shared service for
    // the rest of the session.
    resetWorld(); var api2 = makeApi(); var v2 = makeView(api2);
    api2.buildURL = kinds['checkmate.api'].buildURL;
    v2.$.signinPanel = {
        move: "Queen to King 7", grandmaster: 'Vladimir Kramnik',
        getUrlBase: function () { return 'todo.example.test'; },
        getInsecure: function () { return true; },
        getUseCustomServer: function () { return true; },
        getCustomServer: function () { return 'lan.example.test:8080'; }
    };
    v2.$.buttonLoginOut = {setContent: function () {}};
    v2.$.contentPanels = {
        components: [{}],
        getActive: function () { return {destroy: function () {}}; },
        setIndex: function () {}, render: function () {}, draggable: false
    };
    v2.loginDone();
    ok('logging in points the api at the chosen server',
       api2.buildURL('read-notation') === 'http://lan.example.test:8080/read-notation.php',
       api2.buildURL('read-notation'));
    ok('  and carries the credentials over', api2.notation === "Queen to King 7" && api2.grandmaster === 'Vladimir Kramnik');
    ok('  and the scramble key follows the new notation',
       v2.scrambleMove() === 'queen-king7', v2.scrambleMove());
})();

/* ================= READ-ONLY UNTIL YOU TAP EDIT ================= */
section('A task opens read-only');
(function () {
    // A spell-check field, with just enough of enyo.Control to see where the
    // read-only state actually ends up.
    function makeField() {
        var def = kinds['checkmate.SpellCheckInput'];
        var f = {};
        for (var k in def) { f[k] = def[k]; }
        f.attributes = {contenteditable: 'false', spellcheck: 'true'};
        f.classes = '';
        f.node = {innerText: '', innerHTML: '', attrs: {}, focus: function () {}};
        f.hasNode = function () { return this.node; };
        // The real ones record on the control and apply to the node, which is
        // the whole point: a re-render replays this.attributes.
        f.setAttribute = function (n, v) { this.attributes[n] = v; if (this.node) { this.node.attrs[n] = v; } };
        f.addRemoveClass = function (n, add) {
            var has = this.classes.indexOf(n) !== -1;
            if (add && !has) { this.classes += ' ' + n; }
            if (!add && has) { this.classes = this.classes.replace(n, ''); }
        };
        f.setValue = function (v) { this.node.innerText = v || ''; };
        f.getValue = function () { return this.node.innerText; };
        // Rendering replays the control's attributes onto a fresh node -- which
        // is exactly the moment the old code lost the state.
        f.rerender = function () { this.node = {innerText: this.node.innerText, attrs: {}, focus: function () {}};
            for (var a in this.attributes) { this.node.attrs[a] = this.attributes[a]; } };
        return f;
    }

    var f = makeField();
    f.syncDisabled(true);
    ok('a locked field is not editable', f.attributes.contenteditable === 'false');
    f.syncDisabled(false);
    ok('an unlocked field is editable', f.attributes.contenteditable === 'true');
    ok('  on the node too', f.node.attrs.contenteditable === 'true');

    // The bug: the state used to be written straight to the DOM node, so the
    // control still thought it was "false" and any re-render reverted it.
    f.rerender();
    ok('editability survives a re-render', f.node.attrs.contenteditable === 'true');

    // And the mirror: setDisabled() is a published setter and does nothing when
    // the value has not changed, so it could never put a node back in step.
    f.disabled = true;              // model says locked...
    f.node.attrs.contenteditable = 'true';   // ...while the node is still open
    f.syncDisabled(true);
    ok('a stale editable node is forced back', f.node.attrs.contenteditable === 'false');
    ok('  and the control agrees', f.attributes.contenteditable === 'false');

    // Now the pane itself. The invariant the user actually sees: the Save button
    // shows exactly when the fields accept typing.
    function makeDetail() {
        var def = kinds['checkmate.DetailViewer'];
        var d = {};
        for (var k in def) { d[k] = def[k]; }
        d.inherited = function () {};
        d.taskTitle = ''; d.taskNotes = ''; d.taskGuid = '';
        d.getTaskTitle = function () { return this.taskTitle; };
        d.getTaskNotes = function () { return this.taskNotes; };
        d.$ = {
            taskTitle: makeField(),
            taskNotes: makeField(),
            taskDetailTitle: {content: '', setContent: function (c) { this.content = c; }},
            taskEditCancel: {content: '', setContent: function (c) { this.content = c; }},
            taskSave: {showing: false, disabled: false,
                       setShowing: function (v) { this.showing = v; },
                       setDisabled: function (v) { this.disabled = v; }}
        };
        d.doSave = function () { this.saved = (this.saved || 0) + 1; };
        return d;
    }

    function consistent(d) {
        var editable = d.$.taskTitle.attributes.contenteditable === 'true';
        var notesEditable = d.$.taskNotes.attributes.contenteditable === 'true';
        return editable === d.$.taskSave.showing && notesEditable === d.$.taskSave.showing;
    }

    var d = makeDetail();
    d.taskTitle = 'Look at me';
    d.taskNotes = 'some notes';
    d.render();
    ok('an opened task is read-only', d.$.taskTitle.attributes.contenteditable === 'false');
    ok('  with no Save button', d.$.taskSave.showing === false);
    ok('  and an Edit button', d.$.taskEditCancel.content === 'Edit');
    ok('  and it shows the task', d.$.taskTitle.getValue() === 'Look at me');
    ok('  consistently', consistent(d));

    d.editCancelTap();
    ok('tapping Edit unlocks the fields', d.$.taskTitle.attributes.contenteditable === 'true');
    ok('  and reveals Save', d.$.taskSave.showing === true);
    ok('  and offers Cancel', d.$.taskEditCancel.content === 'Cancel');
    ok('  consistently', consistent(d));

    d.editCancelTap();
    ok('cancelling locks them again', d.$.taskTitle.attributes.contenteditable === 'false');
    ok('  and hides Save', d.$.taskSave.showing === false);
    ok('  consistently', consistent(d));

    // A re-render in between -- which is what happens when the panels relayout --
    // must not leave a locked pane typeable.
    d.editCancelTap();
    d.$.taskTitle.rerender(); d.$.taskNotes.rerender();
    d.editCancelTap();
    ok('a re-render mid-edit still ends up locked', d.$.taskTitle.node.attrs.contenteditable === 'false');
    ok('  consistently', consistent(d));

    var d2 = makeDetail();
    d2.newTask();
    ok('a new task starts editable', d2.$.taskTitle.attributes.contenteditable === 'true');
    ok('  with Save showing', d2.$.taskSave.showing === true);
    ok('  consistently', consistent(d2));
    d2.reset();
    ok('reset locks it back down', d2.$.taskTitle.attributes.contenteditable === 'false');
    ok('  and hides Save', d2.$.taskSave.showing === false);
    ok('  consistently', consistent(d2));
})();

section('Signing in leaves the detail pane idle');
(function () {
    resetWorld(); var api = makeApi(); var v = makeView(api);
    var newTasks = 0, renders = 0, cancels = 0, resets = 0;
    var index = 1;
    v.$.contentPanels = {getIndex: function () { return index; }, setIndex: function (i) { index = i; }};
    v.$.taskDetails = {inEdit: false,
        newTask: function () { newTasks++; this.inEdit = true; },
        render: function () { renders++; },
        editCancelTap: function () { cancels++; this.inEdit = false; },
        reset: function () { resets++; this.inEdit = false; }};

    // A transition that reports while the list is showing must not start a new
    // task. It used to compare the active control against a literal id string,
    // which was true at moments when the panels were only passing through --
    // signing in re-renders them -- so newTask() ran and left the pane in edit
    // mode. listItemTap's inEdit guard then swallowed the next tap on a task,
    // cancelling the edit instead of opening it.
    index = 1;
    v.panelAnimationDone();
    ok('settling on the list starts no new task', newTasks === 0);
    ok('  and clears any stale edit', renders === 1);

    index = 1;
    v.$.taskDetails.inEdit = true;
    v.panelAnimationDone();
    ok('a stale edit is cancelled on the way back', cancels === 1 && v.$.taskDetails.inEdit === false);

    // Deliberately going to the detail pane with nothing selected still starts
    // a new task, which is the point of that branch.
    index = 0;
    v.selectedTask = null;
    v.panelAnimationDone();
    ok('opening the empty detail pane does start a new task', newTasks === 1);

    index = 0;
    v.selectedTask = {guid: 'A', title: 'Look at me'};
    v.$.taskDetails.inEdit = false;
    v.panelAnimationDone();
    ok('opening a selected task does not', newTasks === 1);
})();

console.log('\n========================================');
console.log('  passed: ' + pass + '   failed: ' + fail);
console.log('========================================\n');
process.exit(fail === 0 ? 0 : 1);
