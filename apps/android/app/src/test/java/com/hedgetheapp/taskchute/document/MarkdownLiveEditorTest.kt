package com.hedgetheapp.taskchute.document

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import com.hedgetheapp.taskchute.ui.TaskChuteColors
import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MarkdownLiveEditorTest {
    @Test
    fun logicalLineStartsCountEmptyConsecutiveAndTrailingLinesWithoutCountingSoftWraps() {
        assertEquals(listOf(0), markdownSourceLineStarts(""))
        assertEquals(listOf(0, 4, 5, 10), markdownSourceLineStarts("one\n\nwide\n"))
        assertEquals(4, markdownSourceLineStarts("one\n\nwide\n").size)
        assertEquals(1, markdownSourceLineStarts("one very wide line").size)
    }

    @Test
    fun lineNumberPreferenceDefaultsOnAndPersistsAnExplicitOffValue() {
        val storage = MemoryMarkdownEditorStorage()
        val first = MarkdownEditorPreferences(storage)

        assertTrue(first.showLineNumbers())
        first.setShowLineNumbers(false)

        assertEquals(false, MarkdownEditorPreferences(storage).showLineNumbers())
    }

    @Test
    fun previewOffsetMappingKeepsHeadingAndStyledLinesInTheirLogicalSourceRows() {
        val source = "# Heading\n\n**bold text** wraps across a narrow viewport\nplain"
        val starts = markdownSourceLineStarts(source)
        val transformed = MarkdownPreviewTransformation(MarkdownSelection(source.length, source.length))
            .filter(AnnotatedString(source))

        assertEquals(4, starts.size)
        starts.forEachIndexed { expectedLine, sourceStart ->
            val transformedOffset = transformed.offsetMapping.originalToTransformed(sourceStart)
            val mappedSourceOffset = transformed.offsetMapping.transformedToOriginal(transformedOffset)
            assertEquals(expectedLine, markdownSourceLineIndexAt(starts, mappedSourceOffset))
        }
        assertEquals("Heading\n\nbold text wraps across a narrow viewport\nplain", transformed.text.text)
    }

    @Test
    fun missingOrOutOfRangeSavedCaretUsesSafeSourceSelection() {
        assertEquals(TextFieldValue("body"), initialMarkdownTextFieldValue("body", null))
        assertEquals(TextRange(0), initialMarkdownTextFieldValue("body", -3).selection)
        assertEquals(TextRange(4), initialMarkdownTextFieldValue("body", 20).selection)
        assertEquals("body", initialMarkdownTextFieldValue("body", 2).text)
        assertEquals(TextRange(2), initialMarkdownTextFieldValue("body", 2).selection)
    }

    @Test
    fun externalBodyChangesKeepTheCurrentSelectionAndClampWhenShortened() {
        val restored = initialMarkdownTextFieldValue("0123456789", 2)
        val active = restored.copy(selection = TextRange(7))

        assertEquals(TextRange(7), clampMarkdownTextFieldValueToBody(active, "01234567890").selection)
        assertEquals(TextRange(4), clampMarkdownTextFieldValueToBody(active, "0123").selection)
    }

    @Test
    fun nonCollapsedSelectionPersistsItsEndEndpoint() {
        assertEquals(7, persistedDocumentCaretOffset(TextRange(2, 7)))
        assertEquals(2, persistedDocumentCaretOffset(TextRange(7, 2)))
    }

    @Test
    fun boldAtCaretPlacesCaretBetweenDelimiters() {
        val result = MarkdownEditCommands.bold("abc", MarkdownSelection(1, 1))

        assertEquals("a****bc", result.text)
        assertEquals(MarkdownSelection(3, 3), result.selection)
    }

    @Test
    fun boldSelectionWrapsAndCanBeToggledOff() {
        val wrapped = MarkdownEditCommands.bold("重要", MarkdownSelection(0, 2))
        assertEquals("**重要**", wrapped.text)
        assertEquals(MarkdownSelection(2, 4), wrapped.selection)

        val unwrapped = MarkdownEditCommands.bold(wrapped.text, wrapped.selection)
        assertEquals("重要", unwrapped.text)
        assertEquals(MarkdownSelection(0, 2), unwrapped.selection)
    }

    @Test
    fun headingAndBulletOperateOnAllSelectedLines() {
        val heading = MarkdownEditCommands.headingLevel("一\n二", MarkdownSelection(0, 3), level = 1)
        assertEquals("# 一\n# 二", heading.text)

        val bullet = MarkdownEditCommands.bullet(heading.text, MarkdownSelection(0, heading.text.length))
        assertEquals("- # 一\n- # 二", bullet.text)
    }

    @Test
    fun headingPickerCreatesEachOfferedPrefixAndPlacesCaretAfterItOnBlankLine() {
        MarkdownHeadingLevel.values().forEach { level ->
            val prefix = "#".repeat(level.level) + " "
            val blank = MarkdownEditCommands.headingLevel("", MarkdownSelection(0, 0), level.level)
            val plain = MarkdownEditCommands.headingLevel("Title", MarkdownSelection(0, 0), level.level)

            assertEquals(level.accessibilityLabel, prefix, blank.text)
            assertEquals(level.accessibilityLabel, prefix.length, blank.selection.start)
            assertEquals(level.accessibilityLabel, prefix.length, blank.selection.end)
            assertEquals(level.accessibilityLabel, prefix + "Title", plain.text)
            assertEquals(level.accessibilityLabel, prefix.length, plain.selection.start)
        }
    }

    @Test
    fun headingPickerChangesH1ThroughH6PrefixAndPreservesMultilineSelectionAndSurroundingText() {
        MarkdownHeadingLevel.values().forEach { level ->
            assertEquals(
                "#".repeat(level.level) + " Title",
                MarkdownEditCommands.headingLevel("###### Title", MarkdownSelection(0, 0), level.level).text,
            )
        }

        val source = "before\n#\tFirst\n###### Second\nafter"
        val selectionStart = source.indexOf("#\tFirst")
        val selectionEnd = source.indexOf("Second") + "Second".length
        val result = MarkdownEditCommands.headingLevel(source, MarkdownSelection(selectionStart, selectionEnd), level = 3)

        assertEquals("before\n###\tFirst\n### Second\nafter", result.text)
        assertEquals(selectionStart, result.selection.start)
        assertEquals(selectionEnd - 1, result.selection.end)
    }

    @Test
    fun headingPickerMapsCaretInsideExistingPrefixAndPreservesComposition() {
        val source = "#\tTitle"
        val insidePrefix = MarkdownEditCommands.headingLevel(source, MarkdownSelection(1, 1), level = 3)
        assertEquals("###\tTitle", insidePrefix.text)
        assertEquals(MarkdownSelection(3, 3), insidePrefix.selection)

        val composing = TextFieldValue("# title", selection = TextRange(1), composition = TextRange(2, 7))
        val result = applyMarkdownToolbarAction(composing, MarkdownToolbarActionId.HEADING_3, previousEdit = null)

        assertEquals("### title", result.value.text)
        assertEquals(TextRange(3), result.value.selection)
        assertEquals(TextRange(4, 9), result.value.composition)
        assertNull(result.reversibleEdit)
    }

    @Test
    fun headingLevelActionIdentityAllowsSameLevelRevertButDifferentLevelReplacesIt() {
        val original = TextFieldValue("# タイトル", selection = TextRange(2))
        val h2 = applyMarkdownToolbarAction(original, MarkdownToolbarActionId.HEADING_2, previousEdit = null)
        assertEquals("## タイトル", h2.value.text)

        val sameLevel = applyMarkdownToolbarAction(h2.value, MarkdownToolbarActionId.HEADING_2, h2.reversibleEdit)
        assertTrue(sameLevel.reverted)
        assertEquals(original, sameLevel.value)

        val h3 = applyMarkdownToolbarAction(h2.value, MarkdownToolbarActionId.HEADING_3, h2.reversibleEdit)
        assertFalse(h3.reverted)
        assertEquals("### タイトル", h3.value.text)
        assertNotEquals(original, h3.value)
    }

    @Test
    fun headingPickerSnapshotRejectsChangedSourceSelectionOrSessionButAllowsCompositionUpdate() {
        val original = TextFieldValue("Title", selection = TextRange(2))
        val snapshot = MarkdownHeadingPickerSnapshot("note-1", "Title", original)

        assertTrue(isMarkdownHeadingPickerSnapshotCurrent(snapshot, "note-1", "Title", original))
        assertTrue(
            isMarkdownHeadingPickerSnapshotCurrent(
                snapshot,
                "note-1",
                "Title",
                original.copy(composition = TextRange(1, 3)),
            ),
        )
        assertFalse(isMarkdownHeadingPickerSnapshotCurrent(snapshot, "note-2", "Title", original))
        assertFalse(isMarkdownHeadingPickerSnapshotCurrent(snapshot, "note-1", "Updated", original))
        assertFalse(isMarkdownHeadingPickerSnapshotCurrent(snapshot, "note-1", "Title", original.copy(text = "Typed")))
        assertFalse(isMarkdownHeadingPickerSnapshotCurrent(snapshot, "note-1", "Title", original.copy(selection = TextRange(3))))
    }

    @Test
    fun checkboxConvertsPlainTextAndExistingBulletWithoutChangingCheckedState() {
        assertEquals("- [ ] item", MarkdownEditCommands.checkbox("item", MarkdownSelection(0, 0)).text)
        assertEquals("- [ ] item", MarkdownEditCommands.checkbox("- item", MarkdownSelection(0, 0)).text)
        assertEquals("item", MarkdownEditCommands.checkbox("- [x] item", MarkdownSelection(0, 0)).text)
    }

    @Test
    fun quoteTogglesCurrentLine() {
        assertEquals("> 引用", MarkdownEditCommands.quote("引用", MarkdownSelection(1, 1)).text)
        assertEquals("引用", MarkdownEditCommands.quote("> 引用", MarkdownSelection(3, 3)).text)
    }

    @Test
    fun linkSelectionSelectsUrlPlaceholder() {
        val result = MarkdownEditCommands.link("OpenAI", MarkdownSelection(0, 6))

        assertEquals("[OpenAI](https://)", result.text)
        assertEquals(MarkdownSelection(9, 17), result.selection)
    }

    @Test
    fun linkAtCaretCreatesEditableLabelAndUrl() {
        val result = MarkdownEditCommands.link("", MarkdownSelection(0, 0))

        assertEquals("[](https://)", result.text)
        assertEquals(MarkdownSelection(3, 11), result.selection)
    }

    @Test
    fun everyToolbarActionDoubleTapRestoresExactSourceAndSelectionForEmptyAndSelectedText() {
        val beforeStates = listOf(
            TextFieldValue("", selection = TextRange(0)),
            TextFieldValue("xOpenAIy\nsecond", selection = TextRange(1, 7)),
        )

        val oneShotActions = MarkdownToolbarActionId.values().filterNot {
            it in setOf(
                MarkdownToolbarActionId.INDENT,
                MarkdownToolbarActionId.OUTDENT,
                MarkdownToolbarActionId.MOVE_LINE_UP,
                MarkdownToolbarActionId.MOVE_LINE_DOWN,
            )
        }
        oneShotActions.forEach { action ->
            beforeStates.forEach { before ->
                val first = applyMarkdownToolbarAction(before, action, previousEdit = null)
                assertNotEquals("$action must perform its normal edit once", before, first.value)
                assertNotNull("$action should be reversible before another edit", first.reversibleEdit)

                val second = applyMarkdownToolbarAction(first.value, action, first.reversibleEdit)

                assertTrue("$action second press should take the guarded revert", second.reverted)
                assertEquals("$action restores exact raw source and selection", before, second.value)
                assertNull(second.reversibleEdit)
            }
        }
    }

    @Test
    fun horizontalRuleAddsOnlyTheNeededLineSeparatorsAndKeepsNewlineStyle() {
        assertEquals("---", MarkdownEditCommands.horizontalRule("", MarkdownSelection(0, 0)).text)
        assertEquals("---\nprose", MarkdownEditCommands.horizontalRule("prose", MarkdownSelection(2, 2)).text)
        assertEquals("first\n---\nsecond", MarkdownEditCommands.horizontalRule("first\nsecond", MarkdownSelection(8, 8)).text)
        assertEquals("first\r\n---\r\nsecond", MarkdownEditCommands.horizontalRule("first\r\nsecond", MarkdownSelection(8, 8)).text)
        assertEquals("first\n---\n", MarkdownEditCommands.horizontalRule("first\n", MarkdownSelection(6, 6)).text)

        val preview = MarkdownPreviewTransformation(MarkdownSelection(35, 35))
            .filter(AnnotatedString("---\nprose -- keep"))
        assertTrue(preview.text.text.startsWith("────────────────────────────────\n"))
        assertTrue(preview.text.text.endsWith("prose -- keep"))
    }

    @Test
    fun indentAndOutdentAreIncrementalForPlainListTaskAndBlankLines() {
        var result = MarkdownEditCommands.indent("plain\n- [x] task\n1. ordered\n\n", MarkdownSelection(0, 29))
        assertEquals("  plain\n  - [x] task\n   1. ordered\n  \n", result.text)
        repeat(2) { result = MarkdownEditCommands.indent(result.text, result.selection) }
        assertEquals("      plain\n      - [x] task\n         1. ordered\n      \n", result.text)
        repeat(3) { result = MarkdownEditCommands.outdent(result.text, result.selection) }
        assertEquals("plain\n- [x] task\n1. ordered\n\n", result.text)

        val topLevel = MarkdownEditCommands.outdent("plain", MarkdownSelection(2, 2))
        assertEquals("outdent at level zero is a no-op", "plain", topLevel.text)
        assertEquals(MarkdownSelection(2, 2), topLevel.selection)
        val blankLine = MarkdownEditCommands.indent("a\n\nb", MarkdownSelection(2, 2))
        assertEquals("a\n  \nb", blankLine.text)

        val nested = "1. parent\n   1. child"
        val nestedCaret = nested.indexOf("1. child")
        val deeper = MarkdownEditCommands.indent(nested, MarkdownSelection(nestedCaret, nestedCaret))
        assertEquals("1. parent\n      1. child", deeper.text)
        assertEquals(nested, MarkdownEditCommands.outdent(deeper.text, deeper.selection).text)
    }

    @Test
    fun repeatedToolbarIndentAndOutdentChangeDepthInsteadOfConsumingAnUndoRecord() {
        val firstAction = applyMarkdownToolbarAction(
            TextFieldValue("item", selection = TextRange(0)),
            MarkdownToolbarActionId.BOLD,
            null,
        )
        val firstIndent = applyMarkdownToolbarAction(
            firstAction.value,
            MarkdownToolbarActionId.INDENT,
            firstAction.reversibleEdit,
        )
        val secondIndent = applyMarkdownToolbarAction(
            firstIndent.value,
            MarkdownToolbarActionId.INDENT,
            firstIndent.reversibleEdit,
        )
        assertEquals("    ****item", secondIndent.value.text)
        assertFalse(firstIndent.reverted)
        assertFalse(secondIndent.reverted)
        assertNull(firstIndent.reversibleEdit)
        assertNull(secondIndent.reversibleEdit)

        val firstOutdent = applyMarkdownToolbarAction(secondIndent.value, MarkdownToolbarActionId.OUTDENT, null)
        val secondOutdent = applyMarkdownToolbarAction(firstOutdent.value, MarkdownToolbarActionId.OUTDENT, firstOutdent.reversibleEdit)
        assertEquals("****item", secondOutdent.value.text)
        assertFalse(firstOutdent.reverted)
        assertFalse(secondOutdent.reverted)
    }

    @Test
    fun orderedListNumbersSelectedLinesAndTogglesCaretItemWithoutDroppingTaskState() {
        val source = "- one\n- [x] two\nplain"
        val selected = MarkdownEditCommands.orderedList(source, MarkdownSelection(0, source.length))
        assertEquals("1. one\n2. [x] two\n3. plain", selected.text)

        val toggledOff = MarkdownEditCommands.orderedList("  1. [x] done", MarkdownSelection(5, 5))
        assertEquals("  - [x] done", toggledOff.text)
        val toggledAgain = MarkdownEditCommands.orderedList(toggledOff.text, MarkdownSelection(5, 5))
        assertEquals("  1. [x] done", toggledAgain.text)
    }

    @Test
    fun movingLinesContinuesAcrossTapsAndPreservesCaretSelectionDirectionAndBoundaryNoOps() {
        var value = TextFieldValue("a\nb\nc\nd", selection = TextRange(4))
        repeat(2) {
            val move = applyMarkdownToolbarAction(value, MarkdownToolbarActionId.MOVE_LINE_UP, null)
            value = move.value
        }
        assertEquals("c\na\nb\nd", value.text)
        assertEquals(TextRange(0), value.selection)

        repeat(2) {
            value = applyMarkdownToolbarAction(value, MarkdownToolbarActionId.MOVE_LINE_DOWN, null).value
        }
        assertEquals("a\nb\nc\nd", value.text)
        assertEquals(TextRange(4), value.selection)

        val multi = "one\ntwo\nthree\nfour"
        val reverse = TextFieldValue(multi, selection = TextRange(multi.indexOf("three") + 5, multi.indexOf("two")))
        val moved = applyMarkdownToolbarAction(reverse, MarkdownToolbarActionId.MOVE_LINE_DOWN, null).value
        assertEquals("one\nfour\ntwo\nthree", moved.text)
        assertTrue("reverse selection direction follows the moved text", moved.selection.start > moved.selection.end)
        assertEquals(9, moved.selection.start - moved.selection.end)

        val firstLine = TextFieldValue("a\nb", selection = TextRange(0))
        val noOp = applyMarkdownToolbarAction(firstLine, MarkdownToolbarActionId.MOVE_LINE_UP, null)
        assertEquals(firstLine, noOp.value)
        assertNull(noOp.reversibleEdit)
    }

    @Test
    fun lineMoveKeepsEmptyLineAndCrLfSeparators() {
        val blankLine = MarkdownEditCommands.moveLine("a\n\nb", MarkdownSelection(2, 2), MarkdownLineMove.UP)
        assertEquals("\na\nb", blankLine.text)
        assertEquals(MarkdownSelection(0, 0), blankLine.selection)

        val crlf = MarkdownEditCommands.moveLine("a\r\nb\r\nc", MarkdownSelection(3, 3), MarkdownLineMove.DOWN)
        assertEquals("a\r\nc\r\nb", crlf.text)
    }

    @Test
    fun lineMoveDoesNotChangeTerminalNewlineWhenTrailingBlankWouldMove() {
        val source = "a\n\nb"
        val selection = MarkdownSelection(3, 3)

        val up = MarkdownEditCommands.moveLine(source, selection, MarkdownLineMove.UP)
        assertEquals(source, up.text)
        assertEquals(selection, up.selection)

        val sourceWithFinalNewline = "a\n\nb\n"
        val moved = MarkdownEditCommands.moveLine(sourceWithFinalNewline, MarkdownSelection(3, 3), MarkdownLineMove.UP)
        assertEquals("a\nb\n\n", moved.text)
        assertTrue(moved.text.endsWith('\n'))
    }

    @Test
    fun underlineMapsCollapsedAndReverseSelectionsAndComposesWithBoldAndLinks() {
        val collapsed = TextFieldValue("abc", selection = TextRange(1), composition = TextRange(1))
        val emptySpan = applyMarkdownToolbarAction(collapsed, MarkdownToolbarActionId.UNDERLINE, null)
        assertEquals("a<u></u>bc", emptySpan.value.text)
        assertEquals(TextRange(4), emptySpan.value.selection)
        assertEquals("composition stays between the inserted markers", TextRange(4), emptySpan.value.composition)

        val composingSelection = TextFieldValue("日本", selection = TextRange(0, 2), composition = TextRange(0, 2))
        val composingUnderline = applyMarkdownToolbarAction(composingSelection, MarkdownToolbarActionId.UNDERLINE, null)
        assertEquals("<u>日本</u>", composingUnderline.value.text)
        assertEquals(TextRange(3, 5), composingUnderline.value.composition)
        assertNull("composition-bearing edits do not capture a revert record", composingUnderline.reversibleEdit)

        val reverse = TextFieldValue("x日本語y", selection = TextRange(4, 1))
        val wrapped = applyMarkdownToolbarAction(reverse, MarkdownToolbarActionId.UNDERLINE, null)
        assertEquals("x<u>日本語</u>y", wrapped.value.text)
        assertEquals(TextRange(7, 4), wrapped.value.selection)
        val unwrapped = MarkdownEditCommands.underline(wrapped.value.text, MarkdownSelection(4, 7))
        assertEquals(reverse.text, unwrapped.text)
        assertEquals(MarkdownSelection(1, 4), unwrapped.selection)

        val inline = MarkdownPreviewTransformation(null).filter(AnnotatedString("<u>**bold** [link](https://example.com)</u>"))
        assertEquals("bold link", inline.text.text)
        assertTrue(inline.text.spanStyles.any { it.item.fontWeight?.weight == 700 && it.item.textDecoration == androidx.compose.ui.text.style.TextDecoration.Underline })
        assertTrue(inline.text.spanStyles.any { it.item.textDecoration == androidx.compose.ui.text.style.TextDecoration.Underline })

        val nested = MarkdownPreviewTransformation(null).filter(AnnotatedString("**bo<u>ld</u>** [**li<u>nk</u>**](https://example.com)"))
        assertEquals("bold link", nested.text.text)
        assertTrue(nested.text.spanStyles.any { it.item.fontWeight?.weight == 700 && it.item.textDecoration == androidx.compose.ui.text.style.TextDecoration.Underline })
        assertTrue(nested.text.spanStyles.any { it.item.fontWeight?.weight == 700 && it.item.color == TaskChuteColors.AccentBlue })
    }

    @Test
    fun typedJapaneseTextInvalidatesUnderlineRevertWithoutLosingTheText() {
        val first = applyMarkdownToolbarAction(TextFieldValue(""), MarkdownToolbarActionId.UNDERLINE, null)
        val typed = TextFieldValue("<u>あ</u>", selection = TextRange(4))
        val next = applyMarkdownToolbarAction(typed, MarkdownToolbarActionId.UNDERLINE, first.reversibleEdit)
        assertFalse(next.reverted)
        assertEquals("<u>あ</u>", next.value.text)
    }

    @Test
    fun malformedOrNestedUnderlineMarkersRemainLiteralAndDoNotStyleOtherSource() {
        val malformed = listOf(
            "<u>open",
            "close</u>",
            "<u>outer <u>inner</u></u>",
            "\\<u>escaped</u>",
            "<u>escaped\\</u>",
            "<u class='x'>tag</u>",
            "<script>alert(1)</script>",
        )
        malformed.forEach { source ->
            val preview = MarkdownPreviewTransformation(null).filter(AnnotatedString(source))
            assertEquals(source, preview.text.text)
        }

        val source = "<u>valid</u> <u>broken"
        val preview = MarkdownPreviewTransformation(null).filter(AnnotatedString(source))
        assertEquals(source, preview.text.text)
        assertFalse(preview.text.spanStyles.any { it.item.textDecoration == androidx.compose.ui.text.style.TextDecoration.Underline })
    }

    @Test
    fun underlinePreviewKeepsSourceDisplayOffsetMappingsMonotonic() {
        val source = "before <u>**日本**</u> [<u>リンク</u>](https://example.com) tail"
        val transformed = MarkdownPreviewTransformation(null).filter(AnnotatedString(source))
        assertEquals("before 日本 リンク tail", transformed.text.text)

        var previousDisplay = 0
        (0..source.length).forEach { sourceOffset ->
            val displayOffset = transformed.offsetMapping.originalToTransformed(sourceOffset)
            assertTrue(displayOffset >= previousDisplay)
            assertTrue(displayOffset in 0..transformed.text.length)
            previousDisplay = displayOffset
        }
        var previousSource = 0
        (0..transformed.text.length).forEach { displayOffset ->
            val sourceOffset = transformed.offsetMapping.transformedToOriginal(displayOffset)
            assertTrue(sourceOffset >= previousSource)
            assertTrue(sourceOffset in 0..source.length)
            previousSource = sourceOffset
        }
    }

    @Test
    fun requiredBoldAndLinkDoubleTapsRestoreTheirOriginalSourceAndSelection() {
        val empty = TextFieldValue("", selection = TextRange(0))
        val boldOnce = applyMarkdownToolbarAction(empty, MarkdownToolbarActionId.BOLD, null)
        assertEquals("****", boldOnce.value.text)
        assertEquals(empty, applyMarkdownToolbarAction(boldOnce.value, MarkdownToolbarActionId.BOLD, boldOnce.reversibleEdit).value)

        val linkOnce = applyMarkdownToolbarAction(empty, MarkdownToolbarActionId.LINK, null)
        assertEquals("[](https://)", linkOnce.value.text)
        assertEquals(empty, applyMarkdownToolbarAction(linkOnce.value, MarkdownToolbarActionId.LINK, linkOnce.reversibleEdit).value)

        val selected = TextFieldValue("xOpenAIy", selection = TextRange(1, 7))
        val selectedLink = applyMarkdownToolbarAction(selected, MarkdownToolbarActionId.LINK, null)
        assertEquals("x[OpenAI](https://)y", selectedLink.value.text)
        assertEquals(selected, applyMarkdownToolbarAction(selectedLink.value, MarkdownToolbarActionId.LINK, selectedLink.reversibleEdit).value)
    }

    @Test
    fun interveningTextInputOrSelectionMoveDoesNotRewindThePriorToolbarEdit() {
        val first = applyMarkdownToolbarAction(TextFieldValue(""), MarkdownToolbarActionId.BOLD, null)
        val typed = TextFieldValue("**あ**", selection = TextRange(3))

        val afterTyping = applyMarkdownToolbarAction(typed, MarkdownToolbarActionId.BOLD, first.reversibleEdit)

        assertFalse(afterTyping.reverted)
        assertTrue(afterTyping.value.text.contains("あ"))

        val movedSelection = first.value.copy(selection = TextRange(1))
        val afterMovingSelection = applyMarkdownToolbarAction(movedSelection, MarkdownToolbarActionId.BOLD, first.reversibleEdit)

        assertFalse(afterMovingSelection.reverted)
        assertNotEquals("selection movement invalidates equality with the after snapshot", TextFieldValue(""), afterMovingSelection.value)
    }

    @Test
    fun anotherToolbarActionReplacesThePriorUndoAndCompositionIsNotCaptured() {
        val original = TextFieldValue("")
        val first = applyMarkdownToolbarAction(original, MarkdownToolbarActionId.BOLD, null)
        val second = applyMarkdownToolbarAction(first.value, MarkdownToolbarActionId.HEADING_1, first.reversibleEdit)
        val third = applyMarkdownToolbarAction(second.value, MarkdownToolbarActionId.BOLD, second.reversibleEdit)

        assertFalse(third.reverted)
        assertNotEquals("a different action prevents an older Bold record from rewinding", original, third.value)

        val composing = TextFieldValue("text", selection = TextRange(2), composition = TextRange(0, 4))
        val composingFirst = applyMarkdownToolbarAction(composing, MarkdownToolbarActionId.BOLD, null)
        assertNull(composingFirst.reversibleEdit)
        assertNotNull(composingFirst.value.composition)
    }

    @Test
    fun lineNumberTintIsOnlyAQuieterSecondaryTextTone() {
        val tint = markdownLineNumberTint()

        assertEquals(TaskChuteColors.SecondaryText.copy(alpha = 0.8f), tint)
        assertEquals(0.8f, tint.alpha, 0.001f)
    }

    @Test
    fun inactiveLinesRenderSupportedSyntaxWhileActiveLineRemainsRaw() {
        val source = "**重要**\n# 見出し\n- 項目\n- [x] 完了\n> 引用\n[OpenAI](https://openai.com)"
        val result = MarkdownPreviewTransformation(MarkdownSelection(0, 0)).filter(AnnotatedString(source))

        assertEquals("**重要**\n見出し\n• 項目\n☑ 完了\n引用\nOpenAI", result.text.text)
        assertTrue(result.text.spanStyles.any { it.item.fontWeight?.weight == 700 })
        assertTrue(result.text.spanStyles.any { it.item.textDecoration != null })
    }

    @Test
    fun unfocusedEditorRendersSupportedSyntaxOnEveryLine() {
        val source = "**重要**\n- 項目\n- [ ] 未完了"
        val result = MarkdownPreviewTransformation(null).filter(AnnotatedString(source))

        assertEquals("重要\n• 項目\n☐ 未完了", result.text.text)
    }

    @Test
    fun transformedOffsetsRemainMonotonicAroundHiddenMarkers() {
        val source = "前\n**重要**\n[リンク](https://example.com)"
        val transformed = MarkdownPreviewTransformation(MarkdownSelection(0, 0)).filter(AnnotatedString(source))
        var previous = 0
        for (offset in 0..source.length) {
            val mapped = transformed.offsetMapping.originalToTransformed(offset)
            assertTrue(mapped >= previous)
            previous = mapped
        }
        assertTrue(transformed.text.text.contains("重要"))
        assertTrue(transformed.text.text.contains("リンク"))
    }

    @Test
    fun malformedMarkdownFallsBackWithoutThrowingOrDroppingSource() {
        val source = "**未完了\n[リンク](https://"
        val transformed = MarkdownPreviewTransformation(MarkdownSelection(0, 0)).filter(AnnotatedString(source))

        assertEquals(source, transformed.text.text)
    }

    @Test
    fun renderedUncheckedTaskCheckboxTogglesToCheckedWithoutChangingSurroundingSource() {
        val source = "before\n- [ ] task\r\nafter"
        val result = requireNotNull(toggleTaskCheckbox(source, source.indexOf("- [ ] ")))

        assertEquals("before\n- [x] task\r\nafter", result.text)
    }

    @Test
    fun renderedCheckedTaskCheckboxTogglesLowercaseAndUppercaseToUnchecked() {
        val lower = requireNotNull(toggleTaskCheckbox("- [x] done", 0))
        val upper = requireNotNull(toggleTaskCheckbox("- [X] done", 0))

        assertEquals("- [ ] done", lower.text)
        assertEquals("- [ ] done", upper.text)
    }

    @Test
    fun malformedTaskCheckboxDoesNotToggle() {
        assertEquals(null, toggleTaskCheckbox("- [ ]missing-space", 0))
        assertEquals(null, toggleTaskCheckbox("- [y] invalid", 0))
        assertEquals(null, toggleTaskCheckbox("text", 2))
    }

    @Test
    fun inactiveTaskCheckboxHitUsesMappedMarkerAndWhiteVisualStyle() {
        val source = "- [ ] task\nactive"
        val selection = MarkdownSelection(source.length, source.length)
        val transformed = MarkdownPreviewTransformation(selection).filter(AnnotatedString(source))
        val hits = renderedTaskCheckboxHits(source, selection, transformed.offsetMapping)

        assertEquals(1, hits.size)
        assertEquals(0, hits.single().sourceStart)
        assertEquals(0, hits.single().transformedStart)
        assertEquals(2, hits.single().transformedEndExclusive)
        assertEquals("task", hits.single().label)
        assertTrue(transformed.text.spanStyles.any { it.start == 0 && it.end == 2 && it.item.color == androidx.compose.ui.graphics.Color.White })
    }

    @Test
    fun plainHttpUrlsAreDetectedWithoutRewritingSource() {
        val source = "参考 https://example.com/path?q=1#section と http://example.org"
        val links = markdownLinkSourceRanges(source)

        assertEquals(2, links.size)
        assertEquals("https://example.com/path?q=1#section", source.substring(links[0].sourceStart, links[0].sourceEndExclusive))
        assertEquals("http://example.org", links[1].destination)
    }

    @Test
    fun urlDetectionExcludesObviousTrailingPunctuationAndRejectsUnsupportedOrMalformedSchemes() {
        val source = "https://example.com。 https://example.org/path), javascript://bad https://"
        val links = markdownLinkSourceRanges(source)

        assertEquals(2, links.size)
        assertEquals("https://example.com", links[0].destination)
        assertEquals("https://example.org/path", links[1].destination)
    }

    @Test
    fun existingMarkdownLinkUsesRenderedLabelAsInteractiveRange() {
        val source = "[Example](https://example.com)"
        val links = markdownLinkSourceRanges(source)
        val hits = renderedMarkdownLinkHits(source, object : androidx.compose.ui.text.input.OffsetMapping {
            override fun originalToTransformed(offset: Int) = offset
            override fun transformedToOriginal(offset: Int) = offset
        })

        assertEquals(1, links.size)
        assertEquals("https://example.com", links.single().destination)
        assertEquals(1, hits.size)
        assertEquals("Example", source.substring(hits.single().sourceStart, hits.single().sourceEndExclusive))
        assertEquals("https://example.com", hits.single().destination)
    }

    @Test
    fun checkboxToggleKeepsPreexistingSelection() {
        val source = "- [ ] task\nactive"
        val before = MarkdownSelection(source.length, source.length)
        val result = requireNotNull(toggleTaskCheckbox(source, 0))

        assertEquals(before, preservedSelectionAfterCheckboxToggle(before, result))
    }

    private class MemoryMarkdownEditorStorage : MarkdownEditorPreferences.Storage {
        private val values = mutableMapOf<String, Boolean>()
        override fun readBoolean(key: String): Boolean? = values[key]
        override fun writeBoolean(key: String, value: Boolean) {
            values[key] = value
        }
    }
}
