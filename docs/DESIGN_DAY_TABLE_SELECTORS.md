# Day Table selector design

> Status: Draft
>
> この文書は`docs/DESIGN.md` Section 10のProject / Mode / Section selector interactionを具体化するDesign supplementである。
>
> Product仕様 / Domain / Architecture / Decisionの正本は`main`上のcanonical docsとし、本書はそれらを変更・上書きしない。
>
> `docs/DESIGN.md`と本書に実質的な矛盾が見つかった場合は黙って一方へ合わせず、統合時に解消する。

## 1. Project / Mode selector

ProjectとModeは同じinteraction foundationを使う。

基本形:

```text
Project
┌──────────────────────────┐
│ 🔍 検索…                 │
├──────────────────────────┤
│   未設定                 │
│ ✓ 仕事                   │
│   個人開発               │
│   TaskChute Platform     │
├──────────────────────────┤
│ ＋ 新規Projectを作成     │
└──────────────────────────┘
```

Modeも同じ構造とする。

- Day TableでProject / Modeが未設定の場合、cellには`未設定`を繰り返し表示せずmutedな`—`を表示する。
- selectorでは`未設定`を明示候補として表示する。
- `未設定`を選ぶ操作はそのTask / EntryからProject / Mode assignmentを外すだけで、Project / Mode Definition自体を削除しない。
- Routine由来TaskでProject / Modeを未設定へ変更する場合も、`docs/DESIGN.md` Section 16の`今回だけ / ルーティンに反映`scope selectionを適用する。

### 1.1 Open / focus

- cell/value clickまたはTab flowからselectorを開ける。
- selector close後など、Project / Mode cell自体へfocusがある状態では`Enter`で同じselectorを再度開く。
- `Space`ではProject / Mode selectorを開かない。
- Mouseから開いた場合もkeyboardから開いた場合も、開いた直後はsearch inputへfocusする。
- selectorを開いた瞬間から文字入力をsearchとして扱い、検索欄への追加clickを要求しない。
- selector open中はglobal one-key shortcutを発火させない。

### 1.2 Keyboard operation

search inputへfocusした状態を起点とする。

検索文字が空の場合:

- selector open直後はcandidateを自動activeにしない。
- `↓`で最初のcandidateへ移動する。initial候補の先頭は`未設定`。

検索文字がある場合:

- existing candidateが1件以上matchしたら、先頭のexisting candidateを自動activeにする。
- active existing candidateがある状態で`Enter`すると、そのcandidateを確定してselectorを閉じる。
- existing candidateが0件の場合はcandidateを自動activeにしない。
- quick createが表示されていても自動activeにはしない。`↓`等で明示的にactiveへ移動してから`Enter`した場合だけ新規作成する。
- active candidateがない状態の`Enter`ではselection / quick createを確定しない。

候補navigation:

- search input自体のkeyboard focusを維持したまま、`↑ / ↓`でactive candidateだけを移動する。
- active candidateがcandidate list内にある場合、`↑ / ↓`で前 / 次candidateへ移動する。
- quick createが表示されている場合はcandidate navigationの末尾として到達可能にする。
- 先頭でさらに`↑`、末尾でさらに`↓`を押してもwrapせず、その端に留まる。
- candidateを`↑ / ↓`で移動した後でも、そのまま文字入力を再開できる。
- 検索文字が変わったらcandidate listを再計算し、existing matchがあれば新しい先頭existing candidateをactiveにする。existing matchがなければactive candidateを解除する。
- `Enter`: active candidateがある場合だけ、そのcandidateを確定してselectorを閉じる。
- `Esc`: 値を変更せずselectorを閉じる。
- selectorを`Enter`で確定した後は、次fieldへ自動で進まず、元のProject / Mode cellへfocusを戻す。
- `Esc`で閉じた場合も元のProject / Mode cellへfocusを戻す。
- selector close後の`Tab / Shift+Tab`が、現在のvisual column orderに従って次 / 前のvisible editable / actionable fieldへ移動するauthorityとする。
- initialでは`Space`をProject / Mode selectorのopen / selection用shortcutへ割り当てない。Routine / Note等のbutton-like actionに定義された`Space`操作とは分離する。

例:

```text
search: tas

> TaskChute Platform
  タスク管理
  Task App
  ＋「tas」を新規Projectとして作成
```

`↓`でactive candidateを次へ移し、さらに`↓`でquick createまで到達できる。途中で文字を追加した場合は検索結果を再計算する。

たとえばProject=`仕事`を未設定へ戻す場合:

```text
Project cell
  → selector open
  → ↓
  → 未設定
  → Enter
  → Day Tableでは —
  → focusはProject cellへ戻る
  → Enterで同じselectorを再openできる
  → Tabで次fieldへ進む
```

initialでは`Backspace` / `Delete`をProject / Modeの専用clear shortcutへ割り当てない。search text editとの衝突を避け、`未設定`を選ぶ明示操作をauthorityとする。

## 2. Search / quick create

既存のJapanese / romaji search foundationを利用する。

- direct substring
- case / fullwidth normalization
- hiragana / katakana normalization
- romaji input → kana matching
- reading indexが利用可能な場合のKanji reading match

### 2.1 Quick create

検索文字が既存候補と完全一致しない場合、候補末尾に以下を表示できる。

```text
＋「入力文字」を新規Projectとして作成
```

Modeも同様。

quick createは:

- initial required fieldは名前だけ。
- 作成したProject / Modeをcurrent Task / Entryへ即assignする。
- selectorを閉じる。
- 詳細設定画面は自動で開かない。
- 新規Definitionは設定順の末尾へ追加する。
- 検索結果にexisting candidateがない場合でも自動activeにしない。
- keyboardでは`↑ / ↓`でquick createを明示的にactiveへ移動し、`Enter`で確定する。

quick createを`Enter`で確定した後のfocusも通常selectionと同じく元のProject / Mode cellへ戻し、次fieldへの移動は`Tab`で行う。

### 2.2 Duplicate prevention

`docs/DESIGN.md` Section 10の現行Designに合わせ、existing Definitionとの**exact duplicate**はquick createしない。

検索matchingのためのcase / fullwidth / kana / romaji normalizationを、そのままDefinition identityやuniqueness authorityとしては扱わない。

normalization差まで同一Definitionとして禁止するかは未確定であり、本Design supplementだけでDomain semanticsとして追加しない。

新規作成が成立した場合、保存するnameはユーザーの入力文字列をauthorityとし、search用romaji等を勝手に日本語へ変換しない。

## 3. Section selector

Section selectorはProject / Modeと違い、initialではsearch / quick createを持たない。

```text
Section
┌──────────────────────────┐
│ Sectionなし              │
├──────────────────────────┤
│ ☀ 朝      05:00–09:00   │
│ ✓ 午前    09:00–12:00   │
│ ◇ 昼      12:00–13:00   │
│   午後    13:00–18:00   │
│   夜      18:00–29:00   │
├──────────────────────────┤
│ Section設定を開く…      │
└──────────────────────────┘
```

- `Sectionなし`を先頭候補とする。
- 通常Sectionはcanonical time orderで表示する。
- current valueにはselected stateを示す。
- Section cell自体へfocusがある状態では`Enter`でselectorを開く。`Space`では開かない。
- selectorを開いた直後はcurrent Sectionをcandidate focusとする。current valueが`Sectionなし`なら`Sectionなし`をfocusする。
- `↑ / ↓`でcandidate移動。
- `Enter`で確定。
- `Esc`で変更せず閉じる。
- `Enter`確定後も`Esc`cancel後も元のSection cellへfocusを戻し、次fieldへ自動で進まない。
- selector close後の`Tab / Shift+Tab`で次 / 前のvisible editable / actionable fieldへ移動する。
- initialでは`Space`をSection selectorのopen / selection用shortcutへ割り当てない。
- Section数が多い場合はcandidate領域だけscroll可能にする。
- initialでは文字入力によるSection searchを行わない。
- Day TableからSectionをquick createしない。Section追加は全日coverageへ影響するためSection設定画面で行う。

### 3.1 Section change

未実行TaskのSectionをselectorから直接変更した場合はD-031に従う。

- planned startが存在する場合はclearする。
- 移動先Sectionの開始時刻等から新しいplanned startを自動生成しない。
- `Sectionなし`を選択した場合もplanned startをclearする。

Routine由来TaskでSectionを変更する場合は、既存のRoutine edit scope ruleを適用する。scope selectionを確定した後も元のSection cellへfocusを戻し、次fieldへの移動は`Tab`で行う。

## 4. Mouse / keyboard parity

Project / Mode / Sectionとも、Mouseで一度Rowを選択してから再clickする二段階操作を要求しない。

- value / selector hit area click: 直接selectorを開く。
- keyboard: current visual Tab flowから到達して同じselectorを開く。
- selector cellへfocusがある状態では`Enter`で開く。
- `Space`はselector open / selectionには使わない。
- selector内では`Enter`でcommit、`Esc`でcancelという基本モデルを揃える。
- commit / cancel後は元cellへfocusを戻し、field間の移動は`Tab / Shift+Tab`へ統一する。

Project / Modeだけはopen直後からsearch inputへfocusし、Sectionはcurrent candidate focusとする。これはProject / Modeが多数候補からの検索をprimary interactionにする一方、Sectionは少数のtime-ordered候補から選ぶためである。
