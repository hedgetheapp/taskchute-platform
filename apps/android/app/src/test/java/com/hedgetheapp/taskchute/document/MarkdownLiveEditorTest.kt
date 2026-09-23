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
}
