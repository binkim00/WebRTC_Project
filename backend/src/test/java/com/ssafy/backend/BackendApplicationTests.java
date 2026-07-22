package com.ssafy.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"spring.docker.compose.enabled=false",
		"spring.autoconfigure.exclude="
				+ "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
				+ "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
		"livekit.url=wss://test.livekit.invalid",
		"livekit.api-key=test-api-key",
		"livekit.api-secret=test-api-secret"
})
class BackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
