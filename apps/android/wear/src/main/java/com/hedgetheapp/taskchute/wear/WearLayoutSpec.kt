package com.hedgetheapp.taskchute.wear

/** Responsive translation of the 454-unit D-154 Figma frames into Wear logical coordinates. */
internal class WearLayoutSpec private constructor(
    val displayWidthDp: Float,
    val displayHeightDp: Float,
    val scale: Float,
    val contentWidthDp: Float,
    val taskRowWidthDp: Float,
    val runningContentWidthDp: Float,
) {
    fun scaledFigma(value: Float): Float = value * scale

    val taskRowVisualHeightDp: Float get() = scaledFigma(82f)
    val taskRowItemHeightDp: Float get() = maxOf(taskRowVisualHeightDp, MIN_TOUCH_TARGET_DP)
    val taskRowRadiusDp: Float get() = scaledFigma(28f)
    val taskRowBorderDp: Float get() = maxOf(0.5f, scaledFigma(1f))
    val taskRowTextWidthDp: Float
        get() = (taskRowWidthDp - scaledFigma(90f) - MIN_TOUCH_TARGET_DP).coerceAtLeast(0f)
    val actionTouchTargetDp: Float get() = MIN_TOUCH_TARGET_DP
    val actionVisualSizeDp: Float get() = scaledFigma(48f)
    val actionIconSizeDp: Float get() = scaledFigma(24f)
    val rowProjectionWidthDp: Float get() = scaledFigma(42f)
    val rowProjectionHeightDp: Float get() = scaledFigma(58f)
    val projectionConnectorHeightDp: Float get() = scaledFigma(24f)
    val rowColumnGapDp: Float get() = scaledFigma(10f)
    val sectionVerticalPaddingDp: Float get() = scaledFigma(5f)
    val groupGapDp: Float get() = scaledFigma(8f)
    val horizontalPagePaddingDp: Float get() = scaledFigma(32f)
    val todayTopPaddingDp: Float get() = scaledFigma(24f)
    val todayBottomPaddingDp: Float get() = scaledFigma(38f)

    val runningTitleGroupWidthDp: Float get() = runningContentWidthDp
    val runningTimeGroupWidthDp: Float
        get() = minOf(scaledFigma(140f), runningContentWidthDp / 2f)
    val runningProgressWidthDp: Float get() = runningContentWidthDp
    val runningProgressHeightDp: Float get() = scaledFigma(8f)
    val runningProgressRadiusDp: Float get() = scaledFigma(4f)
    val runningCompleteVisualSizeDp: Float get() = scaledFigma(48f)
    val runningCompleteIconSizeDp: Float get() = scaledFigma(24f)
    val runningNextCardHeightDp: Float get() = scaledFigma(58f)

    companion object {
        const val FIGMA_REFERENCE_WIDTH = 454f
        const val TASK_ROW_FIGMA_WIDTH = 350f
        const val RUNNING_CONTENT_FIGMA_WIDTH = 300f
        const val MIN_TOUCH_TARGET_DP = 48f
        private const val MIN_ADAPTIVE_ROW_WIDTH_DP = 144f

        fun forAvailableWidth(widthDp: Float): WearLayoutSpec = forAvailableSize(widthDp, widthDp)

        fun forAvailableSize(widthDp: Float, heightDp: Float): WearLayoutSpec {
            val safeWidth = widthDp.takeIf { it.isFinite() && it > 0f } ?: 0f
            val safeHeight = heightDp.takeIf { it.isFinite() && it > 0f } ?: 0f
            val circularDiameter = minOf(safeWidth, safeHeight)
            val scale = (circularDiameter / FIGMA_REFERENCE_WIDTH).coerceIn(0f, 1f)
            val pagePadding = 32f * scale
            val contentWidth = (safeWidth - 2f * pagePadding).coerceAtLeast(0f)

            // Keep the Figma ratio on normal watch sizes, but preserve a modest text column on
            // nearby narrower displays. The available content width remains the hard upper bound.
            val proportionalRowWidth = TASK_ROW_FIGMA_WIDTH * scale
            val adaptiveMinimum = minOf(MIN_ADAPTIVE_ROW_WIDTH_DP, contentWidth)
            val rowWidth = minOf(contentWidth, maxOf(proportionalRowWidth, adaptiveMinimum))
            val runningWidth = minOf(contentWidth, RUNNING_CONTENT_FIGMA_WIDTH * scale)

            return WearLayoutSpec(
                displayWidthDp = safeWidth,
                displayHeightDp = safeHeight,
                scale = scale,
                contentWidthDp = contentWidth,
                taskRowWidthDp = rowWidth,
                runningContentWidthDp = runningWidth,
            )
        }
    }
}
