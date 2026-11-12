package com.pixelpace.map

import android.annotation.SuppressLint
import android.graphics.Color
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

@SuppressLint("SetJavaScriptEnabled")
@Composable
actual fun PlatformWebMap(html: String, controller: MapController, modifier: Modifier) {
    var loaded by remember { mutableStateOf(false) }
    var web by remember { mutableStateOf<WebView?>(null) }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            WebView(ctx).apply {
                setBackgroundColor(Color.parseColor("#12351C"))
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                        Log.d("PixelPaceMap", "${m.messageLevel()}: ${m.message()} (${m.lineNumber()})")
                        return true
                    }
                }
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) { loaded = true }
                }
                loadDataWithBaseURL(MapHtml.BASE_URL, html, "text/html", "utf-8", null)
                web = this
            }
        },
        onRelease = { it.destroy() },
    )

    // buffered commands flow once the page is ready
    LaunchedEffect(loaded, web) {
        val w = web ?: return@LaunchedEffect
        if (!loaded) return@LaunchedEffect
        controller.jsCommands.collect { js -> w.evaluateJavascript(js, null) }
    }
}
