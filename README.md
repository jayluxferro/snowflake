### Snowflake's Safari Extension

<p id="downloads" align="center">
	<img src="https://raw.githubusercontent.com/jayluxferro/snowflake/main/Shared%20(App)/Resources/Icon.png" height="120px"/>
	<h2 align="center">Snowflake</h2>
</p>

Snowflake is a system to defeat internet censorship. People who are censored can use Snowflake to access the internet. Their connection goes through Snowflake proxies, which are run by volunteers. For more details about how it works visit https://snowflake.torproject.org.

#### Installation
1. Download and and install the package.
<a href="https://apps.apple.com/us/app/torproject-snowflake/id1597501940" target="_blank">Download Snowflake Safari Extension</a>
2. Launch the Snowflake app after installation.

#### Development
1. Clone and build project with Xcode 13 or greater.
2. Enable "**Develop**" mode in Safari.
3. Allow unsigned extension.
4. Building the project.
```
cd snowflake
./build-safari-extension
```

5. Launch the application from the **extensions/safari/build/Release/Snowflake.app**.

**NB:** If an error is encountered during the *xcodebuild* process, open *extensions/safari/Snowflake.xcodeproj* in Xcode, add a development team and rebuild the project.

<hr/>

#### Sample
<img src="resources/web.png" style="width: 100%; height: auto"/>
