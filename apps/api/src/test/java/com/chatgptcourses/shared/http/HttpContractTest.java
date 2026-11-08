package com.chatgptcourses.shared.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import jakarta.persistence.OptimisticLockException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/** Real MVC binding/validation/advice; test controller is never packaged in the production application. */
class HttpContractTest {
    private static final String CURRENT_TAG = EntityTags.forRevision("project", UUID.fromString("9800659f-254d-41ee-b792-eab36af6591a"), 7);
    private MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void configureMvcWithTheRealValidatorAndAdvice() {
        var validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mvc = MockMvcBuilders.standaloneSetup(new ContractController())
                .setControllerAdvice(new ApiExceptionHandler()).setValidator(validator)
                // Match Spring MVC's Jackson 3 converter, including its official ProblemDetail mixin.
                .setMessageConverters(new JacksonJsonHttpMessageConverter()).build();
    }

    @Test
    void validationReturnsFieldMetadataWithoutSubmittedTextOrConstraintMessages() throws Exception {
        var result = mvc.perform(post("/__contract-test/validate").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"fictional-private-production\",\"locale\":\"not-a-locale\"}")).andReturn();
        assertProblem(result, 400, "VALIDATION_FAILED");
        var body = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("fieldErrors").size()).isEqualTo(2);
        assertThat(body.get("fieldErrors").get(0).get("field").asText()).isEqualTo("locale");
        assertThat(body.get("fieldErrors").get(0).get("code").asText()).isEqualTo("INVALID_FORMAT");
        assertThat(body.get("fieldErrors").get(1).get("field").asText()).isEqualTo("title");
        assertThat(body.get("fieldErrors").get(1).get("code").asText()).isEqualTo("INVALID_LENGTH");
        assertThat(result.getResponse().getContentAsString()).doesNotContain("fictional-private-production", "not-a-locale", "constraint-private", "rejectedValue");
    }

    @Test
    void methodParameterValidationAndMalformedBodiesRemainClientErrors() throws Exception {
        assertProblem(mvc.perform(get("/__contract-test/page").param("page", "0")).andReturn(), 400, "VALIDATION_FAILED");
        assertProblem(mvc.perform(post("/__contract-test/validate").contentType(MediaType.APPLICATION_JSON).content("{")).andReturn(), 400, "INVALID_REQUEST");
        assertProblem(mvc.perform(post("/__contract-test/validate").contentType(MediaType.APPLICATION_XML).content("<private/>" )).andReturn(), 415, "UNSUPPORTED_MEDIA_TYPE");
    }

    @Test
    void conflictOptimisticLockAndUnhandledErrorsAreSanitizedAndNeverCached() throws Exception {
        assertProblem(mvc.perform(get("/__contract-test/errors/conflict")).andReturn(), 409, "CONFLICT");
        assertProblem(mvc.perform(get("/__contract-test/errors/optimistic")).andReturn(), 412, "REVISION_CONFLICT");
        assertProblem(mvc.perform(get("/__contract-test/errors/internal")).andReturn(), 500, "INTERNAL_ERROR");
        assertProblem(mvc.perform(get("/__contract-test/errors/bad-request").queryParam("private", "fictional-private-query")).andReturn(), 400, "INVALID_REQUEST");
    }

    @Test
    void explicitRevisionIsRequiredAndStrongListsUseOrSemantics() throws Exception {
        assertProblem(mvc.perform(post("/__contract-test/revision")).andReturn(), 428, "PRECONDITION_REQUIRED");
        assertProblem(mvc.perform(post("/__contract-test/revision").header(HttpHeaders.IF_MATCH, "*")).andReturn(), 428, "PRECONDITION_REQUIRED");
        assertProblem(mvc.perform(post("/__contract-test/revision").header(HttpHeaders.IF_MATCH, "W/" + CURRENT_TAG)).andReturn(), 412, "REVISION_CONFLICT");
        assertProblem(mvc.perform(post("/__contract-test/revision").header(HttpHeaders.IF_MATCH, "\"old\"" )).andReturn(), 412, "REVISION_CONFLICT");
        var valid = mvc.perform(post("/__contract-test/revision").header(HttpHeaders.IF_MATCH, " , W/\"old\", \"part,one\", " + CURRENT_TAG + " , ")).andReturn();
        assertThat(valid.getResponse().getStatus()).isEqualTo(204);
        assertThat(valid.getResponse().getHeader(HttpHeaders.ETAG)).isEqualTo(CURRENT_TAG);
        assertProblem(mvc.perform(post("/__contract-test/revision").header(HttpHeaders.IF_MATCH, CURRENT_TAG + ", *")).andReturn(), 400, "INVALID_IF_MATCH");
        assertProblem(mvc.perform(post("/__contract-test/revision").header(HttpHeaders.IF_MATCH, CURRENT_TAG + " broken")).andReturn(), 400, "INVALID_IF_MATCH");
    }

    @Test
    void entityTagsDistinguishResourcesAndParserBoundsWorkWithoutBreakingQuotedCommas() {
        assertThatCode(() -> RevisionPreconditions.requireMatch("\"other\", \"part,one\"", "\"part,one\"")).doesNotThrowAnyException();
        var anotherResource = EntityTags.forRevision("project", UUID.randomUUID(), 7);
        assertError(anotherResource, ApiError.REVISION_CONFLICT);
        assertError("\"" + "x".repeat(4096) + "\"", ApiError.INVALID_IF_MATCH);
        assertError(",".repeat(65) + CURRENT_TAG, ApiError.INVALID_IF_MATCH);
        assertError("W/\"unterminated", ApiError.INVALID_IF_MATCH);
        assertThatThrownBy(() -> EntityTags.forRevision("project", UUID.randomUUID(), -1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EntityTags.forRevision("project", UUID.randomUUID(), EntityTags.MAX_SAFE_REVISION + 1)).isInstanceOf(IllegalArgumentException.class);
    }

    private void assertError(String header, ApiError expected) {
        assertThatThrownBy(() -> RevisionPreconditions.requireMatch(header, CURRENT_TAG))
                .isInstanceOfSatisfying(ApiException.class, exception -> assertThat(exception.error()).isEqualTo(expected));
    }

    private void assertProblem(MvcResult result, int expectedStatus, String expectedCode) throws Exception {
        var response = result.getResponse();
        assertThat(response.getStatus()).isEqualTo(expectedStatus);
        assertThat(response.getContentType()).startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("private, no-store");
        var body = mapper.readTree(response.getContentAsString());
        assertThat(body.get("type").asText()).isEqualTo("about:blank");
        assertThat(body.get("title").asText()).isNotBlank();
        assertThat(body.get("detail").asText()).isNotBlank();
        assertThat(body.get("status").asInt()).isEqualTo(expectedStatus);
        assertThat(body.get("code").asText()).isEqualTo(expectedCode);
        assertThat(UUID.fromString(body.get("traceId").asText())).isNotNull();
        assertThat(body.get("instance").asText()).startsWith("/__contract-test/").doesNotContain("?");
        assertThat(response.getContentAsString()).doesNotContain("jdbc:", "fictional-private", "constraint-private", "exception", "stackTrace");
    }

    record ValidationInput(@NotBlank @Size(max = 12, message = "constraint-private") String title,
                           @Pattern(regexp = "fr|en", message = "constraint-private") String locale) { }

    @RestController
    @Profile("http-contract-test-only")
    @RequestMapping("/__contract-test")
    static class ContractController {
        @PostMapping(value = "/validate", consumes = MediaType.APPLICATION_JSON_VALUE)
        ResponseEntity<Void> validate(@Valid @RequestBody ValidationInput input) { return ResponseEntity.noContent().build(); }

        @GetMapping("/page")
        int page(@RequestParam @Min(1) int page) { return page; }

        @GetMapping("/errors/{scenario}")
        void error(@PathVariable String scenario) {
            switch (scenario) {
                case "conflict" -> throw new DataIntegrityViolationException("jdbc:fictional-private");
                case "optimistic" -> throw new OptimisticLockException("fictional-private-production");
                case "bad-request" -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "fictional-private-query");
                default -> throw new IllegalStateException("fictional-private-production");
            }
        }

        @PostMapping("/revision")
        ResponseEntity<Void> revision(@RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch) {
            RevisionPreconditions.requireMatch(ifMatch, CURRENT_TAG);
            return ResponseEntity.noContent().header(HttpHeaders.ETAG, CURRENT_TAG).build();
        }
    }
}
