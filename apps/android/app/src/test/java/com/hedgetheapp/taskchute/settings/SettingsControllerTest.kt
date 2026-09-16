package com.hedgetheapp.taskchute.settings

import com.hedgetheapp.taskchute.today.TodayHttpResponse
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsControllerTest {
    @Test
    fun settingsReadsRunSynchronousRequestOffMainDispatcher() {
        val dispatcher = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "settings-main") }.asCoroutineDispatcher()
        try {
            listOf("sections", "projects", "routines").forEach { kind ->
                val requestThread = CountDownLatch(1)
                val repository = ThreadRecordingSettingsRepository(requestThread)
                val controller = SettingsController(
                    repository,
                    onUnauthorized = {},
                    scope = CoroutineScope(SupervisorJob() + dispatcher),
                )
                when (kind) {
                    "sections" -> controller.openSections()
                    "projects" -> controller.openProjects()
                    "routines" -> controller.openRoutines()
                }

                assertTrue("$kind read did not reach repository", requestThread.await(2, java.util.concurrent.TimeUnit.SECONDS))
                assertTrue(
                    "$kind read ran synchronously on the Main dispatcher: ${repository.threadName}",
                    !repository.threadName.orEmpty().startsWith("settings-main"),
                )
                controller.close()
            }
        } finally {
            dispatcher.close()
        }
    }

    @Test
    fun synchronousHttpRequestBoundaryAlsoRunsOffMainDispatcher() {
        val dispatcher = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "settings-main") }.asCoroutineDispatcher()
        val requestThread = CountDownLatch(1)
        var observedThread: String? = null
        val repository = SettingsHttpRepository({ _, _, _ ->
            observedThread = Thread.currentThread().name
            requestThread.countDown()
            TodayHttpResponse(200, """{"configuration_version_id":"cfg-1","day_boundary_minutes":0,"items":[]}""")
        })
        val controller = SettingsController(repository, {}, CoroutineScope(SupervisorJob() + dispatcher))
        try {
            controller.openSections()
            assertTrue(requestThread.await(2, java.util.concurrent.TimeUnit.SECONDS))
            assertTrue("synchronous HTTP request ran on Main: $observedThread", !observedThread.orEmpty().startsWith("settings-main"))
        } finally {
            controller.close()
            dispatcher.close()
        }
    }

    @Test
    fun unauthorizedReadHandoffReturnsToControllerMainDispatcher() {
        val dispatcher = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "settings-main") }.asCoroutineDispatcher()
        val requestThread = CountDownLatch(1)
        val handoffThread = CountDownLatch(1)
        var observedHandoffThread: String? = null
        val repository = ThreadRecordingSettingsRepository(requestThread, unauthorizedFor = "sections")
        val controller = SettingsController(
            repository,
            onUnauthorized = {
                observedHandoffThread = Thread.currentThread().name
                handoffThread.countDown()
            },
            scope = CoroutineScope(SupervisorJob() + dispatcher),
        )
        try {
            controller.openSections()
            assertTrue(requestThread.await(2, java.util.concurrent.TimeUnit.SECONDS))
            assertTrue(handoffThread.await(2, java.util.concurrent.TimeUnit.SECONDS))
            assertTrue(
                "401 auth handoff ran outside controller Main dispatcher: $observedHandoffThread",
                observedHandoffThread.orEmpty().startsWith("settings-main"),
            )
        } finally {
            controller.close()
            dispatcher.close()
        }
    }

    @Test
    fun sectionDeleteUsesCanonicalAdjacentAbsorption() {
        val repository = FakeSettingsRepository().apply {
            section = AndroidSectionConfiguration("v1", 0, listOf(
                AndroidSectionSetting("morning", "朝", 0, 600),
                AndroidSectionSetting("evening", "夜", 600, 1440),
            ))
        }
        val controller = controller(repository)
        controller.openSections()
        assertTrue(await { controller.state.sectionConfiguration != null && !controller.state.loading })
        controller.requestDeleteSection("morning")
        controller.confirmDelete()

        assertTrue(await { repository.sectionUpdates.size == 1 })
        val request = repository.sectionUpdates.single()
        assertEquals(listOf(AndroidSectionSetting("evening", "夜", 0, 1440)), request.items)
        assertEquals("v1", request.expectedConfigurationVersionId)
        controller.close()
    }

    @Test
    fun sectionEditorAcceptsLogicalClockTextAcrossDayBoundary() {
        val repository = FakeSettingsRepository().apply {
            section = AndroidSectionConfiguration("v1", 300, listOf(
                AndroidSectionSetting("morning", "朝", 300, 540),
                AndroidSectionSetting("night", "夜", 540, 1740),
            ))
        }
        val controller = controller(repository)
        controller.openSections()
        assertTrue(await { controller.state.sectionConfiguration != null && !controller.state.loading })
        controller.openSection("night")
        controller.updateSectionDraft(title = "夜間")
        controller.saveSection()

        assertTrue(await { repository.sectionUpdates.size == 1 })
        val saved = repository.sectionUpdates.single().items
        assertEquals(300, saved.first().startMinute)
        assertEquals(1740, saved.last().endMinute)
        controller.close()
    }

    @Test
    fun ambiguousProjectOperationRetainsExactRequestForRetry() {
        val repository = FakeSettingsRepository().apply {
            projectBoard = AndroidProjectBoard(2, emptyList())
            createProjectResults.add(SettingsResult.Failure("ambiguous", ambiguous = true))
            createProjectResults.add(SettingsResult.Success(Unit))
        }
        val controller = controller(repository)
        controller.openProjects()
        assertTrue(await { controller.state.projectBoard != null && !controller.state.loading })
        controller.openNewProject()
        controller.updateProjectDraft("Life")
        controller.saveProject()
        assertTrue(await { controller.state.unresolvedOperation != null })
        val retained = controller.state.unresolvedOperation
        assertNotNull(retained)
        controller.retryUnresolved()
        assertTrue(await { repository.createdProjects.size == 2 && controller.state.unresolvedOperation == null })
        assertEquals(2, repository.createdProjects.size)
        assertEquals(repository.createdProjects[0], repository.createdProjects[1])
        controller.close()
    }

    @Test
    fun routineToggleCarriesExpectedRevisionAndReloads() {
        val routine = AndroidRoutineSetting("r1", "t1", "朝の準備", null, null, false, RoutineScheduleSpec(), null, null, null, null, "2026-09-16", null, 4)
        val repository = FakeSettingsRepository().apply { routineBoard = AndroidRoutineBoard(3, "2026-09-16", emptyList(), listOf(routine)) }
        val controller = controller(repository)
        controller.openRoutines()
        assertTrue(await { controller.state.routineBoard != null && !controller.state.loading })
        controller.toggleRoutine("r1", true)
        assertTrue(await { repository.enabledRequests.size == 1 })
        assertEquals(1, repository.enabledRequests.size)
        assertEquals(4, repository.enabledRequests.single().expectedSettingsRevision)
        assertTrue(repository.enabledRequests.single().enabled)
        controller.close()
    }

    private fun controller(repository: FakeSettingsRepository) = SettingsController(
        repository,
        onUnauthorized = {},
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
    )

    private fun await(condition: () -> Boolean): Boolean {
        val deadline = System.nanoTime() + 2_000_000_000L
        while (System.nanoTime() < deadline) {
            if (condition()) return true
            Thread.yield()
        }
        return condition()
    }
}

private class ThreadRecordingSettingsRepository(
    private val requestThread: CountDownLatch,
    private val unauthorizedFor: String? = null,
) : AndroidSettingsRepository {
    var threadName: String? = null
        private set

    private fun <T> record(kind: String, result: SettingsResult<T>): SettingsResult<T> {
        threadName = Thread.currentThread().name
        requestThread.countDown()
        if (kind == unauthorizedFor) return SettingsResult.Unauthorized
        return result
    }

    override fun loadSectionConfiguration() = record("sections", SettingsResult.Success(AndroidSectionConfiguration("v1", 0, emptyList())))
    override fun updateSectionConfiguration(request: SectionConfigurationUpdateRequest) = record("mutation", SettingsResult.Success(Unit))
    override fun loadProjectBoard() = record("projects", SettingsResult.Success(AndroidProjectBoard(1, emptyList())))
    override fun createProject(request: CreateProjectSettingsRequest) = record("mutation", SettingsResult.Success(Unit))
    override fun updateProject(request: UpdateProjectSettingsRequest) = record("mutation", SettingsResult.Success(Unit))
    override fun setProjectArchived(request: SetProjectArchivedSettingsRequest) = record("mutation", SettingsResult.Success(Unit))
    override fun reorderProjects(request: ReorderProjectsSettingsRequest) = record("mutation", SettingsResult.Success(Unit))
    override fun deleteProject(request: DeleteProjectSettingsRequest) = record("mutation", SettingsResult.Success(Unit))
    override fun loadRoutineBoard() = record("routines", SettingsResult.Success(AndroidRoutineBoard(1, "2026-09-16", emptyList(), emptyList())))
    override fun createRoutine(request: CreateRoutineSettingsRequest) = record("mutation", SettingsResult.Success(Unit))
    override fun updateRoutine(request: UpdateRoutineSettingsRequest) = record("mutation", SettingsResult.Success(Unit))
    override fun setRoutineEnabled(request: SetRoutineEnabledSettingsRequest) = record("mutation", SettingsResult.Success(Unit))
    override fun deleteRoutine(request: DeleteRoutineSettingsRequest) = record("mutation", SettingsResult.Success(Unit))
}

private class FakeSettingsRepository : AndroidSettingsRepository {
    var section = AndroidSectionConfiguration("v1", 0, emptyList())
    var projectBoard = AndroidProjectBoard(1, emptyList())
    var routineBoard = AndroidRoutineBoard(1, "2026-09-16", emptyList(), emptyList())
    val sectionUpdates = mutableListOf<SectionConfigurationUpdateRequest>()
    val createdProjects = mutableListOf<CreateProjectSettingsRequest>()
    val createProjectResults = ArrayDeque<SettingsResult<Unit>>()
    val enabledRequests = mutableListOf<SetRoutineEnabledSettingsRequest>()
    private val loads = AtomicInteger(0)

    override fun loadSectionConfiguration() = SettingsResult.Success(section)
    override fun updateSectionConfiguration(request: SectionConfigurationUpdateRequest): SettingsResult<Unit> { sectionUpdates += request; section = section.copy(configurationVersionId = request.configurationVersionId, sections = request.items); return SettingsResult.Success(Unit) }
    override fun loadProjectBoard() = SettingsResult.Success(projectBoard)
    override fun createProject(request: CreateProjectSettingsRequest): SettingsResult<Unit> { createdProjects += request; return createProjectResults.removeFirstOrNull() ?: SettingsResult.Success(Unit) }
    override fun updateProject(request: UpdateProjectSettingsRequest) = SettingsResult.Success(Unit)
    override fun setProjectArchived(request: SetProjectArchivedSettingsRequest) = SettingsResult.Success(Unit)
    override fun reorderProjects(request: ReorderProjectsSettingsRequest) = SettingsResult.Success(Unit)
    override fun deleteProject(request: DeleteProjectSettingsRequest) = SettingsResult.Success(Unit)
    override fun loadRoutineBoard() = SettingsResult.Success(routineBoard)
    override fun createRoutine(request: CreateRoutineSettingsRequest) = SettingsResult.Success(Unit)
    override fun updateRoutine(request: UpdateRoutineSettingsRequest) = SettingsResult.Success(Unit)
    override fun setRoutineEnabled(request: SetRoutineEnabledSettingsRequest): SettingsResult<Unit> { enabledRequests += request; return SettingsResult.Success(Unit) }
    override fun deleteRoutine(request: DeleteRoutineSettingsRequest) = SettingsResult.Success(Unit)
}
