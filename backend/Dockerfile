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

# 컨테이너 기본 시간대는 UTC다. 그대로 두면 BaseTimeEntity 의 created_at 처럼
# Clock 빈을 거치지 않는 LocalDateTime.now() 가 UTC 벽시계를 만들어
# 한국시간과 9시간 어긋난 값이 저장된다. 로그 시각도 함께 한국시간으로 맞춘다.
ENV TZ=Asia/Seoul
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

COPY --from=builder /app/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
