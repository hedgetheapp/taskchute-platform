package com.hedgetheapp.taskchute.today

import java.time.LocalDate
import kotlin.math.abs

internal enum class TodayPagingGestureAxis {
    UNDECIDED,
    HORIZONTAL,
    VERTICAL,
}

internal fun resolveTodayPagingGestureAxis(
    deltaX: Float,
    deltaY: Float,
    touchSlop: Float,
    horizontalDominance: Float = 1.25f,
): TodayPagingGestureAxis {
    val absoluteX = abs(deltaX)
    val absoluteY = abs(deltaY)
    if (absoluteX <= touchSlop && absoluteY <= touchSlop) return TodayPagingGestureAxis.UNDECIDED
    if (absoluteX > touchSlop && absoluteX >= absoluteY * horizontalDominance) {
        return TodayPagingGestureAxis.HORIZONTAL
    }
    if (absoluteY > touchSlop) return TodayPagingGestureAxis.VERTICAL
    return TodayPagingGestureAxis.HORIZONTAL
}

/** Returns the physical swipe direction: -1 is left/next Day, +1 is right/previous Day. */
internal fun committedTodayPagingDirection(
    offsetPx: Float,
    velocityXPxPerSecond: Float,
    pageWidthPx: Float,
    flingVelocityThresholdPxPerSecond: Float,
    distanceFraction: Float = 0.28f,
): Int? {
    if (pageWidthPx <= 0f) return null
    val distanceDirection = offsetPx.compareTo(0f)
    if (abs(offsetPx) >= pageWidthPx * distanceFraction && distanceDirection != 0) {
        return distanceDirection
    }
    val velocityDirection = velocityXPxPerSecond.compareTo(0f)
    if (abs(velocityXPxPerSecond) >= flingVelocityThresholdPxPerSecond &&
        velocityDirection != 0 &&
        (distanceDirection == 0 || velocityDirection == distanceDirection)
    ) {
        return velocityDirection
    }
    return null
}

internal fun adjacentTodayLogicalDate(logicalDate: String, physicalSwipeDirection: Int): String {
    require(physicalSwipeDirection == -1 || physicalSwipeDirection == 1)
    val logicalDelta = -physicalSwipeDirection.toLong()
    return LocalDate.parse(logicalDate).plusDays(logicalDelta).toString()
}
