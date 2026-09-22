package com.hedgetheapp.taskchute.settings

internal fun isValidRoutineSchedule(schedule: RoutineScheduleSpec): Boolean = when (schedule.kind) {
    "daily", "monthly_last_day", "workday", "holiday", "official_holiday", "monthly_last_workday" -> true
    "every_n_days" -> schedule.intervalDays in 2..365
    "weekly" -> schedule.weekdays.isNotEmpty() &&
        schedule.weekdays.distinct().size == schedule.weekdays.size &&
        schedule.weekdays.all { it in 0..6 }
    "every_n_weeks" -> schedule.intervalWeeks in 2..52 &&
        schedule.weekdays.isNotEmpty() &&
        schedule.weekdays.distinct().size == schedule.weekdays.size &&
        schedule.weekdays.all { it in 0..6 }
    "monthly_day" -> schedule.dayOfMonth in 1..31
    "monthly_nth_weekday" -> schedule.ordinal in 1..5 && schedule.weekday in 0..6
    "monthly_last_weekday" -> schedule.weekday in 0..6
    "every_n_months_day" -> schedule.intervalMonths in 2..12 && schedule.dayOfMonth in 1..31
    "every_n_months_last_day" -> schedule.intervalMonths in 2..12
    else -> false
}

internal fun parseRoutineScheduleDraft(
    kind: String,
    interval: String,
    day: String,
    ordinal: String,
    weekday: String,
    weekdays: String,
): RoutineScheduleSpec? {
    fun parseInt(value: String): Int? = value.trim().toIntOrNull()

    fun parseWeekdays(): List<Int>? {
        val tokens = weekdays.split(",").map(String::trim)
        if (tokens.any(String::isEmpty)) return null
        val parsed = tokens.map { it.toIntOrNull() ?: return null }
        return parsed.takeIf {
            it.isNotEmpty() &&
                it.distinct().size == it.size &&
                it.all { value -> value in 0..6 }
        }
    }

    val parsed = when (kind) {
        "daily", "monthly_last_day", "workday", "holiday", "official_holiday", "monthly_last_workday" ->
            RoutineScheduleSpec(kind = kind)
        "every_n_days" -> RoutineScheduleSpec(kind = kind, intervalDays = parseInt(interval))
        "weekly" -> RoutineScheduleSpec(kind = kind, weekdays = parseWeekdays() ?: return null)
        "every_n_weeks" -> RoutineScheduleSpec(
            kind = kind,
            intervalWeeks = parseInt(interval),
            weekdays = parseWeekdays() ?: return null,
        )
        "monthly_day" -> RoutineScheduleSpec(kind = kind, dayOfMonth = parseInt(day))
        "monthly_nth_weekday" -> RoutineScheduleSpec(
            kind = kind,
            ordinal = parseInt(ordinal),
            weekday = parseInt(weekday),
        )
        "monthly_last_weekday" -> RoutineScheduleSpec(kind = kind, weekday = parseInt(weekday))
        "every_n_months_day" -> RoutineScheduleSpec(
            kind = kind,
            intervalMonths = parseInt(interval),
            dayOfMonth = parseInt(day),
        )
        "every_n_months_last_day" -> RoutineScheduleSpec(kind = kind, intervalMonths = parseInt(interval))
        else -> return null
    }
    return parsed.takeIf(::isValidRoutineSchedule)
}
