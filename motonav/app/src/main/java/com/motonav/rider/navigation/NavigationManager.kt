package com.motonav.rider.navigation

import android.content.Context

// TODO: uncomment once the Mapbox Navigation SDK dependency + access
// token are set up — see README "Wiring up Mapbox"
// import com.mapbox.navigation.core.MapboxNavigation
// import com.mapbox.navigation.core.MapboxNavigationProvider
// import com.mapbox.navigation.core.trip.session.RouteProgressObserver
// import com.mapbox.navigation.core.trip.session.BannerInstructionsObserver
// import com.mapbox.navigation.base.trip.model.RouteProgress
// import com.mapbox.api.directions.v5.models.BannerInstructions

/**
 * Headless wrapper around the Mapbox Navigation SDK. No map UI — this
 * class's only job is: get a route, track progress against phone GPS,
 * and hand off a simplified NavUpdate every time something changes
 * that's worth telling the device about.
 *
 * Not wired to a real Mapbox instance yet. Fill in the TODOs once the
 * SDK dependency and access token are in place.
 */
class NavigationManager(
    private val context: Context,
    private val onNavUpdate: (NavUpdate) -> Unit
) {

    // private var mapboxNavigation: MapboxNavigation? = null

    fun start() {
        // TODO:
        // mapboxNavigation = MapboxNavigationProvider.retrieve()
        // mapboxNavigation?.registerRouteProgressObserver(routeProgressObserver)
        // mapboxNavigation?.registerBannerInstructionsObserver(bannerInstructionsObserver)
    }

    fun stop() {
        // TODO: unregister observers, mapboxNavigation?.onDestroy()
    }

    fun requestRoute(destinationLat: Double, destinationLon: Double) {
        // TODO: build a RouteOptions request via the Mapbox Directions
        // API, then mapboxNavigation?.requestRoutes(...) -> setNavigationRoutes(...)
    }

    /*
    private val routeProgressObserver = RouteProgressObserver { routeProgress: RouteProgress ->
        // Fires roughly once a second while a route is active — this is
        // the continuous "distance remaining" feed.
        val update = NavUpdate(
            maneuver = WireManeuver.UNKNOWN, // derived from banner instructions instead
            distanceMeters = routeProgress.distanceRemaining.toInt(),
            streetName = "",
            etaMinutes = (routeProgress.durationRemaining / 60).toInt()
        )
        onNavUpdate(update)
    }

    private val bannerInstructionsObserver = BannerInstructionsObserver { banner: BannerInstructions ->
        // Fires once per route step — this is the "turn coming up" event.
        onNavUpdate(mapBannerToNavUpdate(banner))
    }

    private fun mapBannerToNavUpdate(banner: BannerInstructions): NavUpdate {
        // TODO: banner.primary().type() / .modifier() -> WireManeuver
        // e.g. type "turn" + modifier "left" -> WireManeuver.TURN_LEFT
        return NavUpdate(WireManeuver.UNKNOWN, 0, banner.primary().text(), 0)
    }
    */
}
