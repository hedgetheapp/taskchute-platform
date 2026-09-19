import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val signingStoreFile = System.getenv("TASKCHUTE_ANDROID_SIGNING_STORE_FILE")
val signingStorePassword = System.getenv("TASKCHUTE_ANDROID_SIGNING_STORE_PASSWORD")
val signingKeyPassword = System.getenv("TASKCHUTE_ANDROID_SIGNING_KEY_PASSWORD")
val signingValues = listOf(signingStoreFile, signingStorePassword, signingKeyPassword)
val signingValuesPresent = signingValues.count { !it.isNullOrBlank() }
if (signingValuesPresent != 0 && signingValuesPresent != signingValues.size) {
    throw GradleException(
        "Android nonprod signing requires TASKCHUTE_ANDROID_SIGNING_STORE_FILE, " +
            "TASKCHUTE_ANDROID_SIGNING_STORE_PASSWORD, and TASKCHUTE_ANDROID_SIGNING_KEY_PASSWORD together."
    )
}
val nonprodSigningConfigured = signingValuesPresent == signingValues.size
if (nonprodSigningConfigured && !File(requireNotNull(signingStoreFile)).isFile) {
    throw GradleException("Configured Android nonprod signing keystore does not exist.")
}

val configuredVersionCode = providers.gradleProperty("taskchute.versionCode").orNull?.let { raw ->
    raw.toIntOrNull()?.takeIf { it > 0 && it <= 2_100_000_000 }
        ?: throw GradleException("taskchute.versionCode must be a positive Android versionCode.")
} ?: 1

android {
    namespace = "com.hedgetheapp.taskchute"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.hedgetheapp.taskchute"
        minSdk = 28
        targetSdk = 37
        versionCode = configuredVersionCode
        versionName = "0.1"

        val configuredBaseUrl = providers.gradleProperty("taskchute.baseUrl").orNull ?: ""
        buildConfigField("String", "TASKCHUTE_BASE_URL", "\"${configuredBaseUrl.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    if (nonprodSigningConfigured) {
        signingConfigs {
            create("nonprod") {
                storeFile = file(requireNotNull(signingStoreFile))
                storePassword = requireNotNull(signingStorePassword)
                keyAlias = "taskchute-nonprod"
                keyPassword = requireNotNull(signingKeyPassword)
                storeType = "JKS"
            }
        }
    }

    buildTypes {
        getByName("debug") {
            if (nonprodSigningConfigured) {
                signingConfig = signingConfigs.getByName("nonprod")
            }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.19.0")
    implementation("androidx.activity:activity-compose:1.12.1")
    implementation("com.squareup.okhttp3:okhttp:5.3.0")
    implementation(platform("androidx.compose:compose-bom:2026.08.00"))
    debugImplementation(platform("androidx.compose:compose-bom:2026.08.00"))
    androidTestImplementation(platform("androidx.compose:compose-bom:2026.08.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")

    testImplementation("junit:junit:4.13.2")

    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:core:1.7.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
