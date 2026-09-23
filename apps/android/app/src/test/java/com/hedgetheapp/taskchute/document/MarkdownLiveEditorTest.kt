package com.hedgetheapp.taskchute.document

import androidx.compose.ui.text.AnnotatedString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MarkdownLiveEditorTest {
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
    fun inactiveLinesRenderSupportedSyntaxWhileActiveLineRemainsRaw() {
        val source = "**重要**\n# 見出し\n- 項目\n- [x] 完了\n> 引用\n[OpenAI](https://openai.com)"
        val result = MarkdownPreviewTransformation(MarkdownSelection(0, 0)).filter(AnnotatedString(source))

        assertEquals("**重要**\n見出し\n• 項目\n☑ 完了\n引用\nOpenAI", result.text.text)
        assertTrue(result.text.spanStyles.any { it.item.fontWeight?.weight == 700 })
        assertTrue(result.text.spanStyles.any { it.item.textDecoration != null })
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
}
