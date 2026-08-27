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
- Mouseから開いた場合もkeyboardから開いた場合も、開いた直後はsearch inputへfocusする。
- selectorを開いた瞬間から文字入力をsearchとして扱い、検索欄への追加clickを要求しない。
- selector open中はglobal one-key shortcutを発火させない。

### 1.2 Keyboard operation

search inputへfocusした状態を起点とする。

- `↓`: 最初の候補へ移動。initial候補の先頭は`未設定`。
- `↑ / ↓`: 候補移動。
- `Enter`: focused candidateを確定してselectorを閉じる。
- `Esc`: 値を変更せずselectorを閉じる。

たとえばProject=`仕事`を未設定へ戻す場合:

```text
Project cell
  → selector open
  → ↓
  → 未設定
  → Enter
  → Day Tableでは —
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

### 2.2 Duplicate prevention

検索 / matchingに利用するnormalization上で既存候補と同一と判断できる場合、新規作成候補を出さず既存Definitionを優先する。

例:

```text
TaskChute
taskchute
ＴａｓｋＣｈｕｔｅ
```

のような表記差だけで同一扱いできるものは、重複Definitionを作らない。

ただし部分一致しかない場合は、新規作成を選択可能とする。

```text
入力: 仕事

仕事（社内）
仕事（顧客対応）
＋「仕事」を新規Projectとして作成
```

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
- selectorを開いた直後はcurrent Sectionをcandidate focusとする。current valueが`Sectionなし`なら`Sectionなし`をfocusする。
- `↑ / ↓`でcandidate移動。
- `Enter`で確定。
- `Esc`で変更せず閉じる。
- Section数が多い場合はcandidate領域だけscroll可能にする。
- initialでは文字入力によるSection searchを行わない。
- Day TableからSectionをquick createしない。Section追加は全日coverageへ影響するためSection設定画面で行う。

### 3.1 Section change

未実行TaskのSectionをselectorから直接変更した場合はD-031に従う。

- planned startが存在する場合はclearする。
- 移動先Sectionの開始時刻等から新しいplanned startを自動生成しない。
- `Sectionなし`を選択した場合もplanned startをclearする。

Routine由来TaskでSectionを変更する場合は、既存のRoutine edit scope ruleを適用する。

## 4. Mouse / keyboard parity

Project / Mode / Sectionとも、Mouseで一度Rowを選択してから再clickする二段階操作を要求しない。

- value / selector hit area click: 直接selectorを開く。
- keyboard: current visual Tab flowから到達して同じselectorを開く。
- `Enter`でcommit、`Esc`でcancelという基本モデルを揃える。

Project / Modeだけはopen直後からsearch inputへfocusし、Sectionはcurrent candidate focusとする。これはProject / Modeが多数候補からの検索をprimary interactionにする一方、Sectionは少数のtime-ordered候補から選ぶためである。
