import org.gradle.kotlin.dsl.named
import org.springframework.boot.gradle.tasks.run.BootRun

plugins {
    id("java")

    id("org.springframework.boot") version "2.7.18"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "com.je.clipboard"
version = "1.0"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
    withSourcesJar()
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

dependencies {
    implementation("com.zoho.services.catalyst:catalyst-table-library:1.1")
    implementation("com.zoho.services.catalyst:catalyst-cache-library:1.1")

    implementation("com.zoho.catalyst:java-sdk:2.1.0")

    implementation("org.json:json:20250517")
    
    implementation("org.springframework.boot:spring-boot-starter-web")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

repositories {
    maven {
        url = uri("https://maven.zohodl.com")
        name = "java-sdk"
        content {
            includeGroup("com.zoho.catalyst")
        }
    }
    maven { url = uri("https://repo.spring.io/milestone") }
    maven { url = uri("https://repo.spring.io/snapshot") }
}

tasks.named<BootRun>("bootRun") {
    environment("IS_APP_SAIL" to "true")
    environment("X_ZOHO_CATALYST_ACCOUNTS_URL", "https://accounts.zoho.in")
}