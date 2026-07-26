pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        // TODO: add Mapbox's Maven repo + your secret download token here
        // once you're ready to wire in real routing. Mapbox's setup docs
        // cover the credentials block — don't commit the token to git.
    }
}

rootProject.name = "MotoNav"
include(":app")
