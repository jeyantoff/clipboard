plugins {
    id("java")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}

group = "com.je.clipboard"
version = "1.0"

allprojects {
    repositories {
        mavenLocal()
        mavenCentral()
    }
}