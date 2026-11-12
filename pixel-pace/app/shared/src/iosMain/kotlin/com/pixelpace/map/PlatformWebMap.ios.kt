package com.pixelpace.map

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.readValue
import platform.CoreGraphics.CGRectZero
import platform.Foundation.NSURL
import platform.WebKit.WKNavigation
import platform.WebKit.WKNavigationDelegateProtocol
import platform.WebKit.WKWebView
import platform.WebKit.WKWebViewConfiguration
import platform.darwin.NSObject

@OptIn(ExperimentalForeignApi::class)
@Composable
actual fun PlatformWebMap(html: String, controller: MapController, modifier: Modifier) {
    var loaded by remember { mutableStateOf(false) }
    val web = remember { WKWebView(frame = CGRectZero.readValue(), configuration = WKWebViewConfiguration()) }
    // navigationDelegate is a weak reference, so keep the delegate alive here
    val delegate = remember {
        object : NSObject(), WKNavigationDelegateProtocol {
            override fun webView(webView: WKWebView, didFinishNavigation: WKNavigation?) { loaded = true }
        }
    }

    UIKitView(
        modifier = modifier,
        factory = {
            web.navigationDelegate = delegate
            web.loadHTMLString(html, baseURL = NSURL.URLWithString(MapHtml.BASE_URL))
            web
        },
    )

    LaunchedEffect(loaded) {
        if (!loaded) return@LaunchedEffect
        controller.jsCommands.collect { js -> web.evaluateJavaScript(js, completionHandler = null) }
    }
}
