# Spell Check and Auto-Correct in Enyo 2 (webOS / Old WebKit)

## Background

Enyo 1 (Palm SDK era) had built-in spell check and auto-correct support wired
directly into its `enyo.Input` kind. Properties like `spellcheck`, `autocorrect`,
`autoCapitalize`, and `autoWordComplete` were all first-class published properties
that called `applySmartTextOptions()` on create.

**Enyo 2 dropped all of this.** There is no equivalent in `enyo.Input`,
`onyx.Input`, or `enyo.TextArea`. You have to opt in manually — and the approach
that works is non-obvious.

---

## What Doesn't Work (and Why)

### `enyo.TextArea` (`<textarea>`)

Setting `spellcheck="true"` on a textarea will underline misspelled words in
webOS WebKit, but tapping a misspelled word shows **no suggestion popup**. The
browser's spell-replacement mechanism is not wired up to `<textarea>` in this
WebKit version.

### `enyo.Input` / `onyx.Input` (`<input type="text">`)

These **do** show a suggestion popup when you tap a misspelled word — progress!
But tapping a suggestion closes the popup without replacing the word. WebKit 534
(webOS 3.x) cannot perform `execCommand`-based text replacement into an `<input>`
element in a Cordova/hybrid app context.

### `PalmSystem.simulateMouseClick`

Enyo 1 used `PalmSystem.simulateMouseClick(x, y, true/false)` to activate the
**webOS system word-completion bar** (the row of suggestions above the keyboard).
This is a separate system from the browser's built-in spell-check popup. The two
should not be confused:

- **webOS word-completion bar**: system UI above the keyboard, activated by
  `simulateMouseClick`, replaces text via LunaSysMgr.
- **Browser spell-check popup**: WebKit-native popup appearing near the tapped
  word, activated automatically for `<input>` and `contenteditable` elements with
  `spellcheck="true"`.

`simulateMouseClick` is not needed to get the browser spell-check popup to appear,
and calling it alongside the browser popup interferes with replacement.

---

## What Works: `contenteditable` div

A `<div contenteditable="true">` with `spellcheck="true"` gives you:

- Underlines for misspelled words ✓
- Suggestion popup when tapping a misspelled word ✓
- Tap-to-replace working correctly ✓
- Multi-line input (bonus) ✓

### The `enyo-unselectable` Trap

Enyo 2 apps set `class="enyo-unselectable"` on the `<body>`, which applies:

```css
-webkit-user-select: none;
user-select: none;
```

This **overrides `contenteditable`** and makes the div completely non-interactive
for text input — it will look like an input but you cannot type in it. You must
explicitly reverse this on your element.

---

## Implementation

### 1. Define a reusable kind

```javascript
enyo.kind({
    name: "App.MessageInput",   // rename to suit your app
    tag: "div",
    attributes: {
        contenteditable: "true",
        spellcheck:      "true",
        autocorrect:     "on",
        autocapitalize:  "sentence",
        tabindex:        "0"
    },

    getValue: function() {
        var node = this.hasNode();
        if (!node) { return ""; }
        var t = (node.innerText !== undefined) ? node.innerText : node.textContent;
        return t.replace(/\n$/, "");   // trim trailing newline WebKit inserts
    },

    setValue: function(val) {
        var node = this.hasNode();
        if (!node) { return; }
        node.innerHTML = "";           // clear any <br> WebKit inserted
        if (val) { node.innerText = val; }
    }
});
```

### 2. Use it in your component tree

```javascript
{name: "messageInput", kind: "App.MessageInput",
 fit: true,
 classes: "message-input",
 onkeydown: "inputKeyDown"},
```

`getValue()` and `setValue()` match the `enyo.Input` API, so the rest of your
code can stay the same.

### 3. Handle Enter / Shift+Enter

```javascript
inputKeyDown: function(sender, event) {
    if (event.keyCode === 13 && !event.shiftKey) {
        event.preventDefault();
        this.sendMessage();   // or whatever your send action is
        return true;
    }
    // Shift+Enter falls through — WebKit inserts a newline naturally
},
```

### 4. Required CSS

```css
.message-input {
    /* Layout */
    min-height: 40px;
    max-height: 120px;
    overflow-y: auto;
    word-wrap: break-word;
    white-space: pre-wrap;
    -webkit-box-sizing: border-box;
    box-sizing: border-box;
    padding: 8px;

    /* Typography */
    font-size: 15px;
    line-height: 1.4;

    /* CRITICAL: override enyo-unselectable on <body> */
    -webkit-user-select: text;
    user-select: text;
    -webkit-user-modify: read-write;

    /* Visual (match your theme) */
    cursor: text;
    outline: none;
    background-color: #333333;
    color: #e0e0e0;
    border: 1px solid #555555;
    -webkit-border-radius: 4px;
    border-radius: 4px;
}

/* CSS-only placeholder (works when div is truly empty) */
.message-input:empty::before {
    content: "Type a message\2026";   /* \2026 = … */
    color: #888888;
    pointer-events: none;
}
```

**The two critical lines** that make it work:

```css
-webkit-user-select: text;     /* overrides body.enyo-unselectable */
-webkit-user-modify: read-write;  /* tells WebKit this div accepts text input */
```

Without these, the div renders but text input is completely blocked.

---

## Notes

- **`:empty::before` placeholder**: WebKit 534 sometimes inserts a `<br>` into an
  empty `contenteditable` div, which causes `:empty` not to match. The `setValue`
  implementation above uses `node.innerHTML = ""` to remove any such `<br>` when
  clearing the field, keeping the placeholder reliable.

- **`autocorrect: "on"` and `autocapitalize: "sentence"`**: These are Mobile
  Safari / WebKit attributes. Setting them via Enyo's `attributes` hash works
  correctly — they are serialized into the element's opening tag at render time.

- **Multi-line**: Unlike `<input>`, a `contenteditable` div supports natural
  newlines. Shift+Enter inserts a `<br>`/newline that `innerText` reads as `\n`.
  If your app sends to an API, `getValue().trim()` handles this cleanly.

- **ES5 compatible**: All of the above uses `var`, `function`, and `enyo.kind()`.
  No ES6 features are required.
