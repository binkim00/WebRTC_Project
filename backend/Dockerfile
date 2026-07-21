# 1단계: Spring Boot 빌드
FROM gradle:8.10-jdk17 AS builder

WORKDIR /app

COPY gradlew .
COPY gradle ./gradle
COPY build.gradle .
COPY settings.gradle .
COPY src ./src

RUN chmod +x gradlew
RUN ./gradlew clean bootJar --no-daemon

# 2단계: 실행 이미지
FROM eclipse-temurin:17-jre

WORKDIR /app

COPY --from=builder /app/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
