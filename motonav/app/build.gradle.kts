plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.motonav.rider"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.motonav.rider"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1-poc"
    }

    buildFeatures {
        compose = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation(platform("androidx.compose:compose-bom:2024.02.00"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")

    // TODO: add the Mapbox Navigation SDK once you have an access token
    // and the Maven credentials block set up in settings.gradle.kts
    // implementation("com.mapbox.navigationcore:android:3.x.x")
}
