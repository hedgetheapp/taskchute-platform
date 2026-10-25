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
        val heading = MarkdownEditCommands.heading("一\n二", MarkdownSelection(0, 3))
        assertEquals("# 一\n# 二", heading.text)

        val bullet = MarkdownEditCommands.bullet(heading.text, MarkdownSelection(0, heading.text.length))
        assertEquals("- # 一\n- # 二", bullet.text)
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

        MarkdownToolbarActionId.values().forEach { action ->
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
        val second = applyMarkdownToolbarAction(first.value, MarkdownToolbarActionId.HEADING, first.reversibleEdit)
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
