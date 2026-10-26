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
    fun horizontalRulesUseOneEmptyLogicalPreviewRowAndKeepMonotonicSourceMapping() {
        val source = "top\n\n---\nTail"
        val transformed = MarkdownPreviewTransformation(null).filter(AnnotatedString(source))

        assertEquals("top\n\n\nTail", transformed.text.text)
        assertEquals(4, markdownSourceLineStarts(source).size)
        assertEquals(4, markdownSourceLineStarts(transformed.text.text).size)
        assertEquals(setOf(2), markdownThematicBreakLineIndexes(source))
        assertEquals(listOf(5), markdownHorizontalRuleSourceStarts(source, null))
        assertEquals(emptyList<Int>(), markdownHorizontalRuleSourceStarts(source, MarkdownSelection(6, 6)))

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

        val active = MarkdownPreviewTransformation(MarkdownSelection(6, 6)).filter(AnnotatedString(source))
        assertEquals("top\n\n---\nTail", active.text.text)
    }

    @Test
    fun horizontalRuleClassifierExcludesMalformedInlineAndSetextHeadingUnderline() {
        assertEquals(setOf(0, 1, 2), markdownThematicBreakLineIndexes("---\n* * *\n___"))
        assertEquals(emptySet<Int>(), markdownThematicBreakLineIndexes("--\na---b\nTitle\n---"))
        assertEquals(setOf(2), markdownThematicBreakLineIndexes("Title\n\n---"))
    }

    @Test
    fun orderedListEnterContinuesJapaneseAndIncrementsAcrossDigitBoundary() {
        val japanese = TextFieldValue("1. テスト", selection = TextRange("1. テスト".length))
        val japaneseEnter = TextFieldValue("1. テスト\n", selection = TextRange("1. テスト\n".length))
        val japaneseNext = continueOrderedListAfterEnter(japanese, japaneseEnter)
        assertEquals("1. テスト\n2. ", japaneseNext?.text)
        assertEquals(TextRange("1. テスト\n2. ".length), japaneseNext?.selection)

        val ninth = TextFieldValue("9. x", selection = TextRange(4))
        val ninthEnter = TextFieldValue("9. x\n", selection = TextRange(5))
        val tenth = continueOrderedListAfterEnter(ninth, ninthEnter)
        assertEquals("9. x\n10. ", tenth?.text)
        assertEquals(TextRange(9), tenth?.selection)
    }

    @Test
    fun orderedListEnterKeepsIndentAndMarkerStyleAndExitsAnEmptyItem() {
        val indented = TextFieldValue("  9) x", selection = TextRange(6))
        val indentedEnter = TextFieldValue("  9) x\n", selection = TextRange(7))
        assertEquals("  9) x\n  10) ", continueOrderedListAfterEnter(indented, indentedEnter)?.text)

        val empty = TextFieldValue("1. item\n2. ", selection = TextRange("1. item\n2. ".length))
        val emptyEnterText = "1. item\n2. \n"
        val exited = continueOrderedListAfterEnter(empty, TextFieldValue(emptyEnterText, selection = TextRange(emptyEnterText.length)))
        assertEquals("1. item\n\n", exited?.text)
        assertEquals(TextRange("1. item\n".length), exited?.selection)

        val checked = TextFieldValue("1. [x] done", selection = TextRange("1. [x] done".length))
        val checkedEnterText = "1. [x] done\n"
        val continued = continueOrderedListAfterEnter(checked, TextFieldValue(checkedEnterText, selection = TextRange(checkedEnterText.length)))
        assertEquals("1. [x] done\n2. ", continued?.text)
    }

    @Test
    fun orderedListEnterHandlesCrLfAndIgnoresProseMalformedMarkersPastesSelectionsAndComposition() {
        val crlfSource = "1. item\r\nnext"
        val crlfCaret = "1. item".length
        val crlfPrevious = TextFieldValue(crlfSource, selection = TextRange(crlfCaret))
        val crlfProposed = TextFieldValue("1. item\n\r\nnext", selection = TextRange(crlfCaret + 1))
        val crlf = continueOrderedListAfterEnter(crlfPrevious, crlfProposed)
        assertEquals("1. item\r\n2. \r\nnext", crlf?.text)

        val prose = TextFieldValue("memo", selection = TextRange(4))
        assertNull(continueOrderedListAfterEnter(prose, TextFieldValue("memo\n", selection = TextRange(5))))
        val malformed = TextFieldValue("1.test", selection = TextRange(6))
        assertNull(continueOrderedListAfterEnter(malformed, TextFieldValue("1.test\n", selection = TextRange(7))))

        val selected = TextFieldValue("1. item", selection = TextRange(3, 5))
        assertNull(continueOrderedListAfterEnter(selected, TextFieldValue("1. \n", selection = TextRange(4))))
        val pasteText = "1. item\npasted"
        assertNull(continueOrderedListAfterEnter(
            TextFieldValue("1. item", selection = TextRange(7)),
            TextFieldValue(pasteText, selection = TextRange(pasteText.length)),
        ))

        val composing = TextFieldValue("1. にほん", selection = TextRange("1. にほん".length), composition = TextRange(3, 6))
        val compositionCommitted = TextFieldValue("1. にほん\n", selection = TextRange("1. にほん\n".length))
        assertNull(continueOrderedListAfterEnter(composing, compositionCommitted))
        val newComposition = TextFieldValue("1. item\n", selection = TextRange(8), composition = TextRange(3, 7))
        assertNull(continueOrderedListAfterEnter(TextFieldValue("1. item", selection = TextRange(7)), newComposition))

        val before = TextFieldValue("1. item", selection = TextRange(7))
        val repeatedInput = TextFieldValue("1. item\n", selection = TextRange(8))
        val output = requireNotNull(continueOrderedListAfterEnter(before, repeatedInput))
        assertEquals("1. item\n2. ", output.text)
        assertNull("a repeated raw callback cannot produce another marker", continueOrderedListAfterEnter(output, repeatedInput))
        assertTrue(isRepeatedMarkdownEnterCallback(MarkdownEnterEcho(repeatedInput, output), repeatedInput, output))
        assertFalse(isRepeatedMarkdownEnterCallback(MarkdownEnterEcho(repeatedInput, output), repeatedInput, before))
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
        assertEquals("\nprose -- keep", preview.text.text)
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
    fun lineMoveExchangesTrailingBlankAndAllowsTerminalNewlineToChange() {
        val movedUp = MarkdownEditCommands.moveLine("a\n\nb", MarkdownSelection(3, 3), MarkdownLineMove.UP)
        assertEquals("a\nb\n", movedUp.text)
        assertEquals(MarkdownSelection(2, 2), movedUp.selection)

        val movedDown = MarkdownEditCommands.moveLine("a\nb\n", MarkdownSelection(2, 2), MarkdownLineMove.DOWN)
        assertEquals("a\n\nb", movedDown.text)
        assertEquals(MarkdownSelection(3, 3), movedDown.selection)

        val trailingBlankUp = MarkdownEditCommands.moveLine("a\nb\n", MarkdownSelection(4, 4), MarkdownLineMove.UP)
        assertEquals("a\n\nb", trailingBlankUp.text)
        assertEquals(MarkdownSelection(2, 2), trailingBlankUp.selection)

        val trailingBlankPreserved = MarkdownEditCommands.moveLine("a\n\nb\n", MarkdownSelection(3, 3), MarkdownLineMove.UP)
        assertEquals("a\nb\n\n", trailingBlankPreserved.text)
        assertTrue(trailingBlankPreserved.text.endsWith('\n'))
    }

    @Test
    fun lineMoveBoundariesAreNoOpAndNewlineBoundaryCaretFollowsItsLogicalLine() {
        val source = "a\nb"
        val firstUp = MarkdownEditCommands.moveLine(source, MarkdownSelection(0, 0), MarkdownLineMove.UP)
        val lastDown = MarkdownEditCommands.moveLine(source, MarkdownSelection(2, 2), MarkdownLineMove.DOWN)
        assertEquals(source, firstUp.text)
        assertEquals(MarkdownSelection(0, 0), firstUp.selection)
        assertEquals(source, lastDown.text)
        assertEquals(MarkdownSelection(2, 2), lastDown.selection)

        val separatorCaretDown = MarkdownEditCommands.moveLine(source, MarkdownSelection(1, 1), MarkdownLineMove.DOWN)
        assertEquals("b\na", separatorCaretDown.text)
        assertEquals(MarkdownSelection(3, 3), separatorCaretDown.selection)
    }

    @Test
    fun underlineMarkupStaysLiteralWhileBoldAndMarkdownLinkPreviewRemainSupported() {
        val source = "<u>**bold**</u> [link](https://example.com)"
        val preview = MarkdownPreviewTransformation(null).filter(AnnotatedString(source))

        assertEquals("<u>bold</u> link", preview.text.text)
        val underlineSpans = preview.text.spanStyles.filter {
            it.item.textDecoration == androidx.compose.ui.text.style.TextDecoration.Underline
        }
        val linkStart = preview.text.text.indexOf("link")
        assertEquals(1, underlineSpans.size)
        assertTrue(underlineSpans.single().start >= linkStart)
        assertTrue(underlineSpans.single().end <= linkStart + "link".length)
        assertTrue(preview.text.spanStyles.any { it.item.fontWeight?.weight == 700 })

        var previousDisplay = 0
        (0..source.length).forEach { sourceOffset ->
            val displayOffset = preview.offsetMapping.originalToTransformed(sourceOffset)
            assertTrue(displayOffset >= previousDisplay)
            assertTrue(displayOffset in 0..preview.text.length)
            previousDisplay = displayOffset
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
